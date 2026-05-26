# VeloCity Distributed Execution

## Overview

The distributed execution fabric (`src/lib/orchestration/distributed-fabric.ts`) enables multiple worker instances to coordinate workload processing across regions without shared in-memory state.

---

## Worker Model

```typescript
// Workers register on startup
registerWorker({
  workerId: "worker-us-east-1",
  region: "us-east",
  status: "idle",
  currentLoad: 0,
  capabilities: [],  // empty = handles all event types
});

// Workers send heartbeats
heartbeat("worker-us-east-1", 45);  // 45% load

// Workers receive assignments
const assignment = assignWorkload("dispute_opened", payload, priority: 90);
// → { workerId: "worker-us-east-1", assignedAt: "..." }
```

---

## Worker Regions

| Region | Description |
|---|---|
| `local` | Development / single-instance deployment |
| `us-east` | Primary US production |
| `us-west` | US West Coast / failover |
| `eu-west` | European data residency |
| `ap-southeast` | Asia-Pacific |

Workers in `eu-west` can be configured to only accept EU-tenant events (data residency compliance).

---

## Load-Aware Assignment

`assignWorkload()` selects the worker with the lowest `currentLoad` that:
- Is not `offline`
- Has `currentLoad < 80` (threshold for accepting new work)
- Has the required `capabilities` (or empty capabilities = accepts all)

If no worker is available, returns `null` — the calling system should queue the item for retry.

---

## Worker Health

```typescript
getWorkerHealth();
// { total: 3, idle: 1, processing: 2, overloaded: 0, offline: 0 }
```

`deregisterStaleWorkers(maxSilenceMs)` removes workers that haven't heartbeated within the threshold (default 5 minutes) — prevents phantom workers from receiving assignments.

---

## Current State vs. Production

**Current state:** One `local-worker-1` registered by default. The distributed fabric is API-ready but workers are single-process Next.js instances.

**Production path:**
1. Extract `processAutomationQueue()` to a standalone worker process
2. Workers register with the fabric on startup, heartbeat every 30s
3. Load balancer distributes event types across workers by capability
4. Regional workers handle events for their tenant geography

---

## Horizontal Scaling

The queue backend (`automation_queue` table in Supabase) is shared — multiple workers can safely poll it because:
- Each worker updates status to "processing" atomically before processing
- Duplicate processing prevented by the status check
- `dedup_key` unique constraint prevents duplicate queue inserts

For high-throughput scale:
- Use PostgreSQL advisory locks for atomic queue item claiming
- Or migrate queue to Redis Streams / AWS SQS with visibility timeouts
