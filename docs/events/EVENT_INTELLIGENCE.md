# VeloCity Event Intelligence

## Overview

The event intelligence layer (`src/lib/event-intelligence/`) scores anomalous event patterns, detects duplicate surges, and classifies the operational impact of every event type — enabling proactive response before failures cascade.

---

## Anomaly Scoring (`anomaly-scorer.ts`)

Detects statistically unusual events by frequency and payload:

```typescript
scoreEventAnomaly("payment_failed", "tenant-abc", {
  frequency: 45,
  expectedFrequency: 10,
  payloadSize: 12_000,
});
// anomalyScore: 0.9 (frequency 45 > 3× expected 10 → +0.6, payload 12kb → +0.3)
// reason: "frequency 45 exceeds 3x expected 10; payload size 12000 bytes exceeds 10kb"

// Returns null if score ≤ 0.3 (no anomaly)

getAnomaliesByTenant("tenant-abc");
getTopAnomalousEvents(10);  // sorted by anomalyScore descending
```

**Scoring factors:** frequency >3× expected (+0.6) | payload >10kb (+0.3). Score capped at 1.0. Only records if score >0.3.

**Cap:** 500 anomalies.

---

## Duplicate Detection (`duplicate-detector.ts`)

Tracks event occurrence rates within a 60-second window:

```typescript
recordEventOccurrence("payment_failed", "tenant-abc");
// increments count in sliding window

isDuplicateSurge("payment_failed", "tenant-abc", 10);
// true if count > 10 in last 60 seconds

getDuplicatePatterns();
// [{ eventType, tenantId, count, windowMs: 60000, firstSeen, lastSeen }]

clearOldPatterns();
// removes patterns not seen in last 5 minutes
```

---

## Impact Classification (`impact-classifier.ts`)

```typescript
classifyImpact("payment_failed");
// {
//   impactLevel: "critical",
//   affectedSystems: ["payment-processor", "automation-queue"],
//   estimatedUsersAffected: 50,
//   requiresImmedateAction: true,
// }

classifyImpact("unknown_event");
// { impactLevel: "low", affectedSystems: [], estimatedUsersAffected: 0, requiresImmedateAction: false }

getHighImpactEvents();  // impactLevel "high" or "critical"
registerImpact({ eventType: "bulk_cancel", impactLevel: "high", ... });
```

**Pre-registered impacts:**

| Event | Level | Systems | Action Required |
|---|---|---|---|
| payment_failed | critical | payment-processor, automation-queue | ✅ |
| dispute_opened | high | dispute-engine, provider-portal | ❌ |
| sla_breach | high | sla-monitor, escalation-chain | ✅ |
| job_assigned | low | dispatch-engine | ❌ |
