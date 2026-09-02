# Autonomous Recovery

## Overview

The Autonomous Recovery module provides two levels of failure recovery: context-level recovery for the top-level execution function, and graph-level recovery for individual DAG node failures.

Source: `src/lib/execution/recovery.ts`

---

## Context-Level Recovery

`recoverExecution(ctx, error)` is called by the execution engine when the top-level callback function throws. It classifies the error and returns a recovery decision.

```typescript
interface ContextRecoveryResult {
  recovered: boolean;
  strategy: RecoveryStrategy;
  degraded: boolean;
}
```

### Error Classification

| Error pattern | Strategy | recovered | degraded |
|--------------|----------|-----------|---------|
| `network`, `timeout`, `ECONNREFUSED`, `unavailable` (retryCount < 2) | `retry` | true | false |
| `network`, `timeout`, `ECONNREFUSED`, `unavailable` (retryCount >= 2) | `degrade` | false | true |
| `Unauthorized`, `Forbidden` | `abort` | false | false |
| Everything else | `degrade` | false | true |

### Retry Loop in Engine

The engine uses `recoverExecution` inside its retry loop:

```typescript
for (let attempt = 0; attempt <= (opts.maxRetries ?? 2); attempt++) {
  try {
    value = await fn(ctx)
    break
  } catch (err) {
    const recovery = await recoverExecution(ctx, err)
    if (recovery.strategy === "retry" && attempt < (opts.maxRetries ?? 2)) {
      ctx.telemetry.retryCount++
      continue
    }
    if (recovery.degraded) degraded = true
    break
  }
}
```

---

## Graph-Level Recovery

`recoverGraph(graph, failedNodeId, executor, opts)` is called when a specific node in an execution graph fails. It analyzes the DAG structure to determine the optimal recovery strategy and executes it.

```typescript
interface RecoveryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  allowPartialCompletion?: boolean;
  cachedFallbacks?: Map<string, unknown>;
  onStrategy?: (strategy: RecoveryStrategy, nodeId: string) => void;
}

interface RecoveryResult {
  strategy: RecoveryStrategy;
  recoveredNodes: string[];
  skippedNodes: string[];
  continuedNodes: string[];
  graph: ExecutionGraph;
}
```

### Strategy Selection

```typescript
function selectRecoveryStrategy(node, opts): RecoveryStrategy {
  if (node.retryCount < (opts.maxRetries ?? 2)) return "retry"
  if (opts.cachedFallbacks?.has(node.id))       return "use-cache"
  if (node.dependencies.length === 0)            return "skip-node"
  return "degrade"
}
```

Priority order: retry → cache → skip → degrade.

### Strategies

**`retry`**

Resets the failed node to `"pending"` and re-executes the graph from that point. The remaining retry budget is passed to the graph executor.

**`use-cache`**

Retrieves the node's output from `opts.cachedFallbacks`, marks it as `"completed"` with `metadata.fromCache = true`, and allows downstream nodes to proceed using the cached value.

**`skip-node`**

Marks the node as `"skipped"`. Used only for leaf nodes (nodes with no downstream dependents). Execution continues on all other branches.

**`degrade`**

Marks all downstream-dependent nodes as `"skipped"`. Finds unaffected branches (nodes with no dependency on the failed subtree) and continues executing them via `executeGraph`.

**`abort`**

Returned when the failed node is not found in the graph. No further execution occurs.

---

## Downstream Analysis

```typescript
function buildDownstreamSet(graph, failedNodeId): Set<string>
```

DFS traversal from `failedNodeId`, following the `dependencies` relationship in reverse (children of the failed node). Returns all nodes that transitively depend on the failed node.

```typescript
function findUnaffectedNodes(graph, failedNodeId): ExecutionNode[]
```

Returns nodes that are neither the failed node, nor downstream of it, nor already completed. These are the candidates for continued execution.

---

## Partial Completion

`allowPartialCompletion` (default: `true`) controls whether unaffected branches continue after a failure.

When `true`, `recoverGraph` executes all unaffected branches after applying the recovery strategy to the failed subtree. This enables a diamond graph where one branch fails to still deliver the other branch's output.

When `false`, recovery returns immediately after marking failed/skipped nodes without continuing any branches.

---

## Recovery Strategy Types

```typescript
type RecoveryStrategy =
  | "retry"       // re-execute the failed node
  | "use-cache"   // substitute cached output
  | "skip-node"   // skip and continue
  | "degrade"     // skip subtree, continue unaffected branches
  | "abort";      // halt all execution
```

---

## Integration with Graph Engine

Graph-level recovery (`recoverGraph`) is a separate capability from the graph executor's built-in retry loop. The graph executor handles transient per-node failures automatically (up to `maxNodeRetries`). `recoverGraph` is called explicitly when a more sophisticated recovery decision is needed — for example, when a node has exhausted its retries and the engine must decide whether to fall back to cache, skip the subtree, or continue partial execution.
