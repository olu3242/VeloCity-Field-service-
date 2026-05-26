# VeloCity Advanced Observability

## Overview

The observability layer (`src/lib/observability/`) provides distributed tracing, latency profiling, failure causation tracking, and correlation analysis — giving engineering teams full visibility into how events flow across the platform.

---

## Distributed Tracing (`distributed-tracing.ts`)

```typescript
// Start a trace at the entry point:
const trace = startTrace("dispute-resolution", "automation-worker", { tenantId });

// Add child spans:
const ivySpan = startSpan(trace.traceId, "ivy-dispatch", "ai-runtime");
const dbSpan = startSpan(trace.traceId, "audit-log-write", "database", ivySpan.spanId);

// Finish spans as operations complete:
finishSpan(trace.traceId, dbSpan.spanId, "success");
finishSpan(trace.traceId, ivySpan.spanId, "success");
finishTrace(trace.traceId, "success");
// trace.totalDurationMs = root span duration

getRecentTraces(10);  // last 10 complete/in-progress traces
```

Traces are stored in a rolling 1000-entry Map. Each trace captures the full span tree with parent-child relationships for waterfall visualization.

---

## Runtime Latency Maps (`latency-map.ts`)

```typescript
recordLatency("dispute-resolution", 1842);
recordLatency("dispute-resolution", 2100);

getLatencyBucket("dispute-resolution");
// {
//   operation: "dispute-resolution",
//   p50Ms: 1842, p95Ms: 2100, p99Ms: 2100,
//   avgMs: 1971,
//   sampleCount: 2,
// }

getSlowOperations(2000);  // p95 > 2000ms → candidates for optimization
```

Each operation retains the last 100 latency samples. Percentiles computed on-demand from sorted samples.

---

## Failure Lineage (`failure-lineage.ts`)

Tracks causation chains between failures:

```typescript
const root = recordFailure("payment_failed", "Stripe timeout");
const child = recordFailure("dispute_opened", "Payment not cleared", {
  parentFailureId: root.id,
  tenantId: "tenant-abc",
});

getFailureChain(child.id);
// [ root, child ]  — from root cause to this failure

getRelatedFailures(child.id);
// Other children of root (sibling failures in the same causation chain)
```

Failure graph capped at 500 nodes. Useful for root cause analysis: one payment failure cascading into multiple dispute openings surfaces as a connected chain.

---

## Correlation Graph (`correlation-graph.ts`)

Captures how events follow each other across the platform:

```typescript
recordCorrelation("payment_failed", "dispute_opened", 45_000);   // 45s delay
recordCorrelation("payment_failed", "dispute_opened", 30_000);

getMostFrequentSequences(5);
// [ { fromEvent: "payment_failed", toEvent: "dispute_opened", frequency: 2, avgDelayMs: 37500 } ]

detectBottlenecks(2000);  // operations where p95 > 2000ms
// [ { operation: "ivy-dispatch", avgLatencyMs: 2100, severity: "high" } ]
```

**Bottleneck severity thresholds (p95):**
- `critical`: > 5,000ms
- `high`: > 2,000ms
- `medium`: > 1,000ms
- `low`: above threshold but < 1,000ms

---

## Observability Pipeline

```
AI dispatch → recordLatency("ivy-dispatch", latencyMs)
           → startSpan(traceId, "ivy-dispatch", "ai-runtime")

Event failure → recordFailure(eventType, error, { parentFailureId })

Event sequence → recordCorrelation(fromEvent, toEvent, delayMs)

Admin dashboard reads:
  getAllLatencyBuckets()       → latency heat map
  getRecentTraces()           → trace waterfall view
  detectBottlenecks(1000)     → bottleneck report
  getMostFrequentSequences()  → event flow diagram
```
