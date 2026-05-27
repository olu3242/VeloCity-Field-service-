# VeloCity Runtime Optimization

## Overview

The runtime optimization layer (`src/lib/runtime-optimization/`) reduces redundant execution through deduplication, optimizes retry timing with exponential backoff, batches events for throughput, and identifies optimal orchestration paths — minimizing cost and latency without changing correctness.

---

## Execution Deduplication (`deduplication.ts`)

Prevents duplicate event processing within a configurable time window:

```typescript
// Check before processing:
if (checkAndRegister(`dispute_opened:${disputeId}`, 30_000)) {
  return;  // duplicate — already processing
}
// proceed with handler

isDuplicate("payment_failed:job-123");  // true if seen in last 30s

evictExpired();  // clean up expired keys (call periodically)

getStats();
// { total: 847, activeKeys: 12, duplicatesBlocked: 34 }
```

**Cap:** 10,000 keys. When full, 20% oldest entries are evicted. Default TTL: 30 seconds.

Dedup keys should follow the pattern: `${eventType}:${entityId}` for reliable uniqueness.

---

## Smart Retry Timing (`retry-timing.ts`)

Exponential backoff with jitter — prevents retry storms:

```typescript
shouldRetry(2, "Connection timeout");
// { shouldRetry: true, delayMs: 4_384, reason: "Transient error — retrying", attemptNumber: 2 }

shouldRetry(3, "400 Bad Request");
// { shouldRetry: false, reason: "Permanent error — no retry" }

shouldRetry(5, "timeout");
// { shouldRetry: false, reason: "Max retries exceeded" }

getRetrySchedule(5);
// [1_000, 2_107, 4_284, 8_419, 16_832]  (ms, with jitter)
```

**Default config:** base 1s, max 300s, multiplier 2×, jitter 20%, max 5 retries.

Permanent errors (containing "400", "invalid", "not_found") skip retry immediately.

---

## Queue Batching (`queue-batching.ts`)

Groups events of the same type for batch processing:

```typescript
addToBatch("notification_email", "evt-123", { to: "user@example.com" });
addToBatch("notification_email", "evt-124", { to: "user2@example.com" });
// ... after 10 items or 5 seconds:
// batch auto-flushed

flushBatch("notification_email");  // manual flush
flushStaleBatches();               // flush all batches older than maxWaitMs

getBatchStats();
// { pendingBatches: 1, flushedBatches: 42, avgBatchSize: 7.3 }
```

**Default config:** max 10 items per batch, flush after 5 seconds. Batching is most effective for notification and analytics events.

---

## Path Optimization (`path-optimizer.ts`)

Tracks and recommends optimal execution paths per event type:

```typescript
registerPath({
  pathId: "dispute-fast",
  eventType: "dispute_opened",
  steps: ["GABRIEL", "IVY"],
  avgDurationMs: 38_000,
  successRate: 0.97,
  costUsd: 0.017,
});

// After each execution, update metrics:
recordPathExecution("dispute-fast", "dispute_opened", 42_000, true, 0.018);

getOptimalPath("dispute_opened");
// {
//   recommendedPath: { pathId: "dispute-fast", successRate: 0.97 },
//   alternatives: [...],
//   rationale: "Highest composite score (success×0.5 + speed×0.3 + cost×0.2)"
// }
```

Path scoring: `successRate×0.5 + speedScore×0.3 + costScore×0.2`

---

## Optimization Impact

| Technique | Expected Reduction |
|---|---|
| Deduplication | 5–15% fewer redundant handler runs |
| Smart retry timing | 30–50% fewer retry storms under load |
| Queue batching | 3–8× throughput for batch-compatible events |
| Path optimization | 10–20% latency reduction via optimal routing |
