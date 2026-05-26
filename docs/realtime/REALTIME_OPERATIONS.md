# VeloCity Realtime Operations

## Overview

The realtime layer (`src/lib/realtime/`) provides live operational visibility — broadcasting queue state, runtime events, dispute progress, and worker health to admin dashboards and monitoring systems without requiring database polling.

---

## Queue Status Stream (`queue-stream.ts`)

In-memory pub/sub for queue depth and throughput:

```typescript
// Subscribe to live queue updates:
const subId = subscribe((status) => {
  console.log(`Queue: ${status.queueDepth} items, ${status.processingRate}/min`);
}, tenantId);

// Push updated state (called by worker after each batch):
updateQueueStatus({
  queueDepth: 45,
  processingRate: 12,
  activeWorkers: 3,
  failureRate: 0.02,
  avgLatencyMs: 1800,
});

// Unsubscribe when done:
unsubscribe(subId);
```

Broadcasts fire synchronously to all registered callbacks on each `updateQueueStatus()` call. Tenant-scoped subscribers receive the same global status — tenant-level filtering is applied at the dashboard layer.

---

## Runtime Event Broadcasting (`event-broadcaster.ts`)

Admin live ops feed for governance and anomaly events:

```typescript
broadcastEvent("governance", "runtime.paused", { reason: "Maintenance window" }, "warning");
broadcastEvent("anomaly", "queue.saturation", { depth: 200, capacity: 150 }, "critical");
broadcastEvent("ai_call", "dispatch.failed", { agent: "IVY", error: "timeout" }, "warning", tenantId);
```

**Event categories:** `queue`, `ai_call`, `worker`, `governance`, `anomaly`, `escalation`

Rolling log of 500 events. Admin subscribers receive every event; per-tenant filtering is not applied at this layer — admin feed is platform-wide.

```typescript
getRecentEvents(20);          // last 20 events
getEventsByCategory("anomaly", 10);  // last 10 anomaly events
```

---

## Dispute State Sync (`dispute-state-sync.ts`)

Live dispute lifecycle tracking:

```typescript
upsertDisputeState({
  disputeId: "disp-123",
  tenantId: "tenant-abc",
  phase: "evidence_gathering",
  jobId: "job-456",
  amount: 15000,
  lastAgentAction: "IVY requested evidence",
  openedAt: "2025-05-26T10:00:00Z",
  updatedAt: new Date().toISOString(),
});

getLiveDisputes("tenant-abc");
// [ { disputeId, phase, ageMs: 3_600_000, ... } ]

getDisputeSummary();
// { total: 4, byPhase: { opened: 1, evidence_gathering: 2, review: 1 }, avgAgeMs: 7200000 }
```

`resolveDispute(id)` removes from live tracking. Resolved disputes are recorded in operational memory, not held in live state.

---

## Worker Heartbeat Stream (`worker-heartbeat.ts`)

Worker health monitoring with stale detection:

```typescript
recordHeartbeat({
  workerId: "worker-1",
  timestamp: new Date().toISOString(),
  queueDepth: 12,
  activeJobs: 3,
  cpuLoad: 0.45,
  memoryUsageMb: 512,
  isHealthy: true,
});

getStaleWorkers();     // workers with no heartbeat in last 30s
getLatestHeartbeats(); // one per worker
```

**Stale threshold:** 30 seconds. Workers not heartbeating within this window are flagged for self-healing.

---

## Dashboard Integration

| Stream | Refresh | Display |
|---|---|---|
| Queue status | On each update | Depth gauge, rate chart |
| Runtime events | Real-time | Live event feed |
| Dispute state | On phase change | Active disputes grid |
| Worker heartbeats | Every 5s | Worker health grid |
