# VeloCity Multi-Region Readiness

## Overview

The multi-region layer (`src/lib/regions/`) provides region-aware queue routing, distributed worker configuration, automatic failover, and latency-optimized orchestration — enabling VeloCity to operate across multiple geographic regions with enterprise reliability.

---

## Region Registry (`region-registry.ts`)

```typescript
// Pre-registered regions:
// us-east (primary, 3 workers, ~45ms) — active
// eu-west (secondary, 2 workers, ~120ms) — active

updateRegionHealth("us-east", {
  status: "degraded",
  queueDepth: 180,
  avgLatencyMs: 890,
});

getPrimaryRegion();         // us-east (if still active)
getActiveRegions();         // all non-offline regions
getRegionStatus();
// { total: 2, active: 1, degraded: 1, offline: 0 }
```

---

## Failover Router (`failover-router.ts`)

Automatic failover when primary region degrades:

```typescript
evaluateFailover();
// Primary healthy:
// { targetRegionId: "us-east", isFailover: false, estimatedLatencyMs: 45 }

// After marking us-east offline:
updateRegionHealth("us-east", { status: "offline" });
evaluateFailover();
// { targetRegionId: "eu-west", isFailover: true, estimatedLatencyMs: 120 }
// → FAILOVER_ACTIVE = true

deactivateFailover();   // when us-east recovers
isFailoverActive();     // false
getActiveRegionId();    // "us-east" (or failover region)
```

Failover decisions are data — routing infrastructure reads `getActiveRegionId()` to direct traffic.

---

## Region Health Monitor (`region-health-monitor.ts`)

```typescript
scoreRegionHealth("us-east");
// {
//   latencyScore: 100,    // < 50ms → perfect
//   workerScore: 100,     // 3/3 target workers
//   queueScore: 88,       // light queue
//   compositeScore: 95,
//   recommendation: "Healthy",
// }

detectDegradedRegions();   // composite < 60

getLatencyAwareRoute("eu-west");
// If eu-west composite >= 70, returns "eu-west"
// Else returns lowest-latency healthy region
```

**Composite weights:** latency 40%, workers 30%, queue 30%.

**Recommendations:** > 80 = Healthy | 60-79 = Monitor | 40-59 = Scale workers | < 40 = Consider failover

---

## Distributed Worker Config (`distributed-worker-config.ts`)

```typescript
computeOptimalWorkerCount("us-east", 90);
// config: { minWorkers:2, maxWorkers:8, targetConcurrency:5 }
// needed = ceil(90 / 5) = 18 → capped at maxWorkers 8
// returns: 8

getWorkerConfig("eu-west");
// { minWorkers:1, maxWorkers:4, targetConcurrency:3, priorityLaneEnabled:false, aiCallsPerWorker:25 }
```

**Default configs:**

| Region | Min | Max | Concurrency | Priority Lane | AI Calls/Worker |
|---|---|---|---|---|---|
| us-east | 2 | 8 | 5 | ✅ | 50 |
| eu-west | 1 | 4 | 3 | ❌ | 25 |

---

## Latency-Aware Orchestration

```
Incoming event
    ↓
getActiveRegionId()           → pick target region
getLatencyAwareRoute(region)  → validate or reroute
computeOptimalWorkerCount()   → scale workers for region
scoreRegionHealth(region)     → confirm composite >= 60
    ↓
Route to regional worker pool
```

Events never cross regional boundaries after assignment — tenant data residency is preserved.

---

## Failover SLA

| Scenario | Detection | Recovery Target |
|---|---|---|
| Worker failure | 30s heartbeat timeout | < 60s (redistributed) |
| Region degraded | Composite < 40 | < 2 min (evaluateFailover) |
| Region offline | Status = offline | Immediate (failover active) |
