# VeloCity Cross-Platform Coordination

## Overview

The cross-platform coordination layer (`src/lib/cross-platform/`) tracks external platform connections, records sync operations, and bridges workflow execution across integrated systems — with governance gating on all outbound execution.

---

## Platform Registry (`platform-registry.ts`)

```typescript
getConnectedPlatforms();
// [stripe-payments (payment), ops-crm (crm)]

registerPlatform({
  id: "logistics-erp",
  name: "Logistics ERP",
  type: "erp",
  endpoint: "https://erp.logistics.internal",
});
// status defaults to "disconnected"

updatePlatformStatus("logistics-erp", "connected", 42);
// sets lastSyncAt and latencyMs

getPlatformsByType("payment");
// [stripe-payments]
```

**Pre-registered platforms:**

| ID | Type | Status |
|---|---|---|
| stripe-payments | payment | connected |
| ops-crm | crm | connected |

**Status values:** `connected` | `degraded` | `disconnected`

---

## Sync Tracker (`sync-tracker.ts`)

```typescript
recordSync("stripe-payments", "inbound", "payment_event", 847, "success", 312);

getRecentSyncs("stripe-payments", 20);
// most recent 20 syncs, newest first

getSyncStats("stripe-payments");
// {
//   totalSyncs: 142,
//   successRate: 0.979,
//   avgDurationMs: 287,
//   lastSyncAt: "2025-05-27T14:32:00.000Z",
// }
```

**Cap:** 200 sync records.

---

## Execution Bridge (`execution-bridge.ts`)

```typescript
const exec = initiateExecution("velocity", "stripe-payments", "payment-recovery-flow", "tenant-abc");
// if isRuntimePaused(): exec.status = "failed", workflowId prefixed "PAUSED:"
// otherwise: exec.status = "initiated"

updateExecutionStatus(exec.id, "completed");
// sets completedAt on terminal states (completed/failed)

getActiveExecutions("tenant-abc");
// executions with status "initiated" or "in_progress" for tenant

getExecutionById(exec.id);
```

**Status flow:** `initiated` → `in_progress` → `completed` | `failed`

**Cap:** 100 executions. All outbound initiations blocked when `isRuntimePaused()`.
