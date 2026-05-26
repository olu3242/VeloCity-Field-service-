# VeloCity Scaling Coordination

## Overview

The scaling layer (`src/lib/scaling/`) manages dynamic load distribution, retry pressure control, dead-letter recovery, and execution quota enforcement — ensuring the platform handles burst traffic without degrading critical flows.

---

## Load Balancer (`load-balancer.ts`)

```typescript
const rec = analyzeLoad({
  currentWorkers: 3,
  queueDepth: 120,
  processingRatePerWorker: 8,   // events/min per worker
  avgProcessingMs: 2200,
  failureRate: 0.04,
  targetQueueDrainSeconds: 60,
});
// {
//   action: "scale_up",
//   urgency: "high",
//   targetWorkers: 5,
//   reasoning: "Queue depth 120 requires 5 workers to drain in 60s",
//   impact: "Estimated queue drain in 60s with 5 workers"
// }
```

**Actions:** `scale_up`, `scale_down`, `throttle`, `rebalance`, `maintain`

`calculateOptimalWorkers(queueDepth, targetDrainTimeS, avgProcessingMs)`:
```
workerCapacity = 60_000 / avgProcessingMs  (events/min per worker)
needed = ceil(queueDepth / (targetDrainTimeS / 60 × workerCapacity))
```

---

## Throttle Controller (`throttle-controller.ts`)

Protects the queue from retry storms during high-pressure periods:

```typescript
shouldSuppressRetry(eventPriority: number, currentRetryRate: number);
// Low priority (< 40) events suppressed when:
//   retryRate > maxRetryRate (default 100/min)
//   OR systemPressureThreshold exceeded (default 0.8)
```

**Default retry pressure config:**
```typescript
{
  maxRetryRate: 100,           // retries/min before throttling
  systemPressureThreshold: 0.8,
  suppressionWindowMs: 60_000,
  priorityCutoff: 40,          // only suppress low-priority events
}
```

Critical events (priority > 40) are never suppressed regardless of pressure.

---

## Dead-Letter Handler (`dead-letter-handler.ts`)

Captures unrecoverable events for inspection and replay:

```typescript
addToDeadLetter({
  eventType: "payment_failed",
  payload: { jobId: "job-123" },
  tenantId: "tenant-abc",
  error: "Max retries exceeded",
  originalQueueId: "q-456",
});

// Later — manual or automated replay:
replayItem("dlq-789");  // re-emits via emitEvent()

// Or discard:
discardItem("dlq-789", "Stale event — job already cancelled");
```

---

## Execution Quotas (`execution-quotas.ts`)

```typescript
const DEFAULT_QUOTAS = {
  hourlyEventLimit: 1000,
  hourlyAICallLimit: 200,
  dailyAITokenBudget: 1_000_000,
  concurrentWorkflowLimit: 10,
};

checkQuota("ai_call", tenantId);
// { allowed: true } or { allowed: false, reason: "...", resetAt: "..." }

recordUsage("ai_call", tenantId);

// Quotas can be overridden per tenant:
setQuota(tenantId, { hourlyAICallLimit: 500 });
```

Hourly quotas reset on the hour. Daily token budget resets at midnight UTC.

---

## Scaling Under Load

Recommended scaling response sequence:

1. `analyzeLoad()` → recommends `scale_up`
2. Provision additional worker processes (infrastructure layer)
3. Register new workers via `distributed-fabric.ts`
4. `shouldSuppressRetry()` gates low-priority retries during scale-up window
5. Monitor queue depth → `maintain` when drain rate catches up
