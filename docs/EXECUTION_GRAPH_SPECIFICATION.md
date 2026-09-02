# Execution Graph Specification

## Overview

The Execution Graph Engine converts execution plans into directed acyclic graphs (DAGs) and executes them with dependency ordering, parallel branch execution, failure isolation, and critical path analysis.

Source: `src/lib/execution/graph.ts`

---

## Graph Structure

### ExecutionNode

```typescript
interface ExecutionNode {
  id: string;               // unique within graph
  name: string;             // human-readable label
  workstream: string;       // owning workstream
  dependencies: string[];   // ids of nodes that must complete before this one
  status: NodeStatus;       // pending | running | completed | failed | skipped | cached
  startedAt?: string;       // ISO 8601
  completedAt?: string;     // ISO 8601
  durationMs?: number;      // wall-clock time for this node
  retryCount: number;       // number of attempts made so far
  maxRetries: number;       // maximum allowed attempts (default: 2)
  error?: string;           // last error message if status = failed
  output?: unknown;         // value returned by the executor
  metadata: Record<string, unknown>;
}
```

### ExecutionEdge

```typescript
interface ExecutionEdge {
  from: string;   // source node id
  to: string;     // target node id
}
```

### ExecutionGraph

```typescript
interface ExecutionGraph {
  id: string;               // UUID
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  criticalPath: string[];   // ordered node ids on the longest chain
  generatedAt: string;      // ISO 8601
}
```

---

## API

### `buildGraph(steps: StepDefinition[]): ExecutionGraph`

Constructs an `ExecutionGraph` from a flat list of step definitions. Each step specifies its id, name, workstream, and optional `dependsOn` array.

Edges are derived from `dependsOn`. Critical path is computed using DFS from all root nodes (nodes with no dependencies). The longest chain wins.

All nodes start with `status: "pending"` and `retryCount: 0`.

### `singleNodeGraph(workstream: string, workflow: string): ExecutionGraph`

Creates a minimal single-node graph for workstreams that don't require multi-step orchestration. Used as the fallback when AI planning is disabled or fails.

### `validateDAG(graph: ExecutionGraph): { valid: boolean; error?: string }`

Validates that:
1. Every node referenced in `dependencies` exists in the graph.
2. No cycles exist (a node cannot be its own ancestor).

Returns `{ valid: true }` on success, or `{ valid: false, error: "<message>" }` on failure.

### `executeGraph(graph, executor, opts?): Promise<ExecutionGraph>`

Runs the graph to completion. Nodes are executed in waves: each wave contains all nodes whose dependencies have `status: "completed"`. Waves run in parallel via `Promise.allSettled`.

Options:
```typescript
interface GraphExecutionOptions {
  maxNodeRetries?: number;        // default: node.maxRetries or 2
  nodeTimeoutMs?: number;         // ms per node (not yet enforced at graph level)
  onNodeStart?: (node: ExecutionNode) => void;
  onNodeComplete?: (node: ExecutionNode) => void;
  onNodeFailed?: (node: ExecutionNode) => void;
}
```

### `computeGraphStats(graph: ExecutionGraph): GraphStats`

```typescript
interface GraphStats {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
  running: number;
  successRate: number;   // completed / (total - skipped)
  totalDurationMs: number;
}
```

---

## Execution Algorithm

### Wave-by-wave execution

```
while (pending nodes remain) {
  wave = nodes where:
    status === "pending" AND
    all dependencies have status === "completed"

  if (wave is empty AND pending nodes remain):
    mark all remaining pending nodes as "skipped"
    break

  await Promise.allSettled(wave.map(executeNode))
}
```

### Node execution

```
for (attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    node.status = "running"
    node.startedAt = now()
    node.output = await executor(node)
    node.status = "completed"
    break
  } catch (err) {
    node.retryCount++
    node.error = err.message
    if (attempt < maxRetries) {
      await sleep(2^attempt * 100ms)  // 100ms, 200ms, 400ms…
    }
  }
}
if (node.retryCount > maxRetries) node.status = "failed"
```

### Failure isolation

When a node fails, all nodes that directly or transitively depend on it are marked `"skipped"` in subsequent waves. Branches with no dependency on the failed node continue executing normally.

---

## Critical Path

The critical path is the longest dependency chain in the graph measured in node count. For a graph with a diamond structure (root → left, root → right, left → merge, right → merge), the critical path is the branch containing the most nodes.

Computed via DFS from root nodes, tracking maximum depth. The path that reaches the deepest leaf wins. In case of ties, the first path found is used.

---

## Node Status Lifecycle

```
pending
  │
  ▼ (wave ready)
running
  │
  ├──► completed  (executor resolved)
  │
  ├──► failed     (all retries exhausted)
  │
  └──► skipped    (dependency failed, never entered wave)
```

`cached` is reserved for nodes resolved via the cache recovery strategy (see AUTONOMOUS_RECOVERY.md).

---

## Examples

### Linear chain

```
buildGraph([
  { id: "a", name: "A", workstream: "dispatch" },
  { id: "b", name: "B", workstream: "dispatch", dependsOn: ["a"] },
  { id: "c", name: "C", workstream: "dispatch", dependsOn: ["b"] },
])
// criticalPath: ["a", "b", "c"]
// Execution: wave 1 = [a], wave 2 = [b], wave 3 = [c]
```

### Diamond (parallel branches)

```
buildGraph([
  { id: "root",  name: "Root",  workstream: "dispatch" },
  { id: "left",  name: "Left",  workstream: "dispatch", dependsOn: ["root"] },
  { id: "right", name: "Right", workstream: "dispatch", dependsOn: ["root"] },
  { id: "merge", name: "Merge", workstream: "dispatch", dependsOn: ["left", "right"] },
])
// criticalPath: ["root", "left", "merge"] or ["root", "right", "merge"]
// Execution: wave 1 = [root], wave 2 = [left, right] (parallel), wave 3 = [merge]
```

### Failure isolation

```
// If "left" fails:
// "merge" is marked "skipped" (depends on "left")
// "right" is NOT skipped (no dependency on "left")
// Execution: wave 1 = [root], wave 2 = [left (FAIL), right (OK)],
//            wave 3 = [merge (SKIP)]
```
