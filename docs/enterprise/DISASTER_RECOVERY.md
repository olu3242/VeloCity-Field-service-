# VeloCity Disaster Recovery

## Overview

The recovery layer (`src/lib/recovery/`) provides safe, governed tooling for queue recovery, event replay, worker failover, and operational rollback — with explicit guarantees against runtime corruption during recovery operations.

---

## Queue Recovery (`queue-recovery.ts`)

```typescript
// Capture failed event for recovery:
addToRecovery({
  originalEventId: "evt-abc",
  eventType: "payment_failed",
  tenantId: "tenant-abc",
  payload: { jobId: "job-123", amount: 15000 },
  error: "Max retries exceeded — Stripe timeout",
  attempts: 3,
});

getRecoveryQueue("tenant-abc");   // pending items for tenant

// Recovery actions:
await recoverItem("rec-xyz", "replay");    // re-emits event into fabric
await recoverItem("rec-xyz", "escalate"); // routes to human review
discardRecoveryItem("rec-xyz", "Job cancelled — recovery unnecessary");

getRecoveryStats();
// { total: 12, pending: 8, recovered: 4, byAction: { replay: 3, discard: 1 } }
```

**Recovery actions:** `replay` (re-emit via emitEvent), `requeue` (back to queue), `escalate` (human review), `discard` (permanent close)

Safety: `replay` dynamically imports emitEvent — if runtime is paused, the import succeeds but governance blocks dispatch.

---

## Replay Recovery (`replay-recovery.ts`)

Managed replay sessions for batch event recovery:

```typescript
const session = startReplaySession(
  "Post-incident replay: payment_failed events 2025-05-26",
  ["payment_failed", "payout_failed"],
  "tenant-abc"
);

// For each replayed event:
recordReplayResult(session.id, true);   // success
recordReplayResult(session.id, false);  // failure

completeReplaySession(session.id, "completed");

getActiveSession();      // currently running session (only one at a time)
getSessionHistory(5);    // last 5 completed sessions
```

Only one active replay session is tracked at a time. Sessions are advisory — actual event re-emission goes through `queue-recovery.ts`.

---

## Worker Failover (`worker-failover.ts`)

```typescript
// When a worker goes offline:
recordWorkerFailover("worker-2", ["worker-1", "worker-3"], 45);

// After redistribution is confirmed:
resolveFailover(event.id);
// recoveryMs calculated from detection to resolution

getActiveFailovers();   // unresolved worker failures
getAvgRecoveryMs();     // historical average recovery time
```

Worker failover records feed the resilience tester and operational readiness scorer.

---

## Operational Rollback (`operational-rollback.ts`)

```typescript
// Capture current config state before a change:
const point = captureRollbackPoint(
  "pre-tuning-2025-05-26",
  { retryBaseDelayMs: 60_000, maxConcurrentAICalls: 10 },
  "composite_effectiveness < 80"
);

// Execute rollback if needed:
executeRollback(point.id);
// { success: true, restoredConfig: { retryBaseDelayMs: 60_000, ... } }

// If runtime is paused:
executeRollback(point.id);
// { success: false, message: "Cannot rollback while runtime is paused" }

getAvailableRollbackPoints();  // unused points, newest first
getRecentRollbacks(5);         // last 5 executed rollbacks
```

Cap: 20 rollback points (oldest evicted). Rollback points are config snapshots only — they do not restore DB state or replay events.

---

## Recovery Safety Guarantees

1. **Queue recovery** — `replay` action goes through event fabric; governance blocks execution if paused
2. **Replay sessions** — advisory tracking only; no direct DB writes
3. **Worker failover** — records the redistribution; does not directly modify worker state
4. **Operational rollback** — blocked if `isRuntimePaused() === true`; never modifies audit logs

---

## Disaster Recovery Runbook

### Scenario: Queue saturation + worker failure

1. `recordWorkerFailover(failedId, remainingWorkers, queueDepth)`
2. `computeOptimalWorkerCount(regionId, queueDepth)` → scale up
3. `getRecoveryQueue()` → identify stuck events
4. `startReplaySession(...)` → batch replay with tracking
5. `await recoverItem(id, "replay")` for each stuck event
6. `resolveFailover(eventId)` when queue drains
7. `getResilienceReport()` → verify recovery

### Scenario: Bad config causing cascading failures

1. `captureRollbackPoint("incident-recovery", currentConfig)`  (if not already captured)
2. `runDeploymentHealthCheck()` → identify blockers
3. `executeRollback(preIncidentPoint.id)` → restore known-good config
4. `completeReplaySession(sessionId, "completed")`
5. `scoreOperationalReadiness()` → verify composite ≥ 70 before re-enabling traffic
