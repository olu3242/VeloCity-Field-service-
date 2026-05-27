# VeloCity Execution Graph

## Overview

The execution graph layer (`src/lib/execution-graph/`) tracks every AI agent action as a named node in a directed acyclic graph — recording parent/child lineage, replaying failed chains, and identifying critical paths through multi-step workflows.

---

## Lineage Tracker (`lineage-tracker.ts`)

Tracks execution nodes with parent/child relationships:

```typescript
const node = startNode("dispute_opened", {
  agentName: "IVY",
  tenantId: "tenant-abc",
  parentId: rootNode.id,
  metadata: { disputeId: "d-123" },
});
// node.id, node.status = "running"

completeNode(node.id, "success");
// node.completedAt, node.durationMs set

getLineage(node.id);
// [rootNode, parentNode, node]  (oldest → newest)

getChildren(parentId);
// [node, ...]

getRecentNodes(20);
// last 20 nodes in insertion order
```

**Cap:** 2,000 nodes. Oldest evicted when full.

---

## Dependency Graph (`dependency-graph.ts`)

Maps causal dependencies between event types:

```typescript
addDependency("payment_failed", "dispute_opened");
// "payment_failed" must complete before "dispute_opened"

getDependencies("dispute_opened");
// ["payment_failed"]

findCriticalPath("dispute_opened");
// BFS walk up to depth 10 — returns longest dependency chain
```

---

## Replay Chain (`replay-chain.ts`)

Records execution replays for audit and recovery:

```typescript
recordReplay({
  originalNodeId: "node-123",
  eventType: "payment_failed",
  reason: "transient_error",
  tenantId: "tenant-abc",
  attemptNumber: 2,
  outcome: "success",
});

getReplaysByEventType("payment_failed");
// all replays for that event type

getReplayStats();
// { total: 47, successRate: 0.89, byReason: { transient_error: 35, timeout: 12 } }
```

**Cap:** 500 entries.

---

## Execution Flow

```
emitEvent("dispute_opened", context)
    ↓
startNode("dispute_opened", { agentName: "IVY", parentId })
    ↓
dispatchAgent("IVY", ...)
    ↓
completeNode(id, "success" | "failed")
    ↓
recordReplay(...)  // if retried
```
