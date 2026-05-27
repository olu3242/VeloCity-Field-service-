# VeloCity Operational State Engine

## Overview

The operational state engine (`src/lib/state/`) provides canonical in-memory tracking of workflow lifecycle states — with validated transitions, point-in-time snapshots for recovery, and a full transition audit trail.

---

## Workflow State (`workflow-state.ts`)

```typescript
const wf = createWorkflowState("dispute-resolution", "tenant-abc", 5, { disputeId: "d-123" });
// wf.status = "pending", wf.currentStep = 0

updateWorkflowState(wf.id, { status: "running", currentStep: 1 });
// blocked silently if isRuntimePaused()

getWorkflowState(wf.id);
getWorkflowsByTenant("tenant-abc");
getWorkflowsByStatus("running");
```

**Status values:** `pending` | `running` | `completed` | `failed` | `paused`

**Cap:** 1,000 workflows. `updateWorkflowState` is a no-op when `isRuntimePaused()`.

---

## State Snapshots (`state-snapshots.ts`)

Point-in-time state captures for replay-safe recovery:

```typescript
takeSnapshot(wf.id, "tenant-abc", 3, { resolvedSteps: ["audit", "classify", "notify"] }, "pre-escalation");

getSnapshots(wf.id);
// all snapshots for this workflow, oldest → newest

getLatestSnapshot(wf.id);
// most recent snapshot

restoreFromSnapshot(wf.id, snapshotId);
// returns the matching snapshot for the caller to restore from
```

**Cap:** 20 snapshots per workflow (oldest evicted).

---

## State Transitions (`state-transitions.ts`)

Validated status transitions with full audit trail:

```typescript
recordTransition(wf.id, "tenant-abc", "pending", "running", "worker-1");
// { valid: true, transitionedAt }

recordTransition(wf.id, "tenant-abc", "completed", "running", "worker-1");
// { valid: false }  — invalid transition recorded for audit

isValidTransition("running", "paused");   // true
isValidTransition("completed", "running"); // false

getTransitionHistory(wf.id);   // all transitions for workflow
getInvalidTransitions();        // all transitions where valid = false
```

**Valid transitions:**

| From | To |
|---|---|
| pending | running |
| running | completed, failed, paused |
| paused | running |
| failed | pending (retry) |
| completed | — (terminal) |

`recordTransition` returns `valid: false` (without pushing to store) when `isRuntimePaused()`.

**Cap:** 500 transitions.
