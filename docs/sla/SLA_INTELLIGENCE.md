# VeloCity SLA Intelligence

## Overview

The SLA intelligence layer (`src/lib/sla/`) provides breach prediction, escalation timing, response scoring, and priority routing — ensuring critical events receive guaranteed processing within contractual time windows.

---

## Breach Prediction (`breach-predictor.ts`)

```typescript
const slaEntry = registerSLA({
  tenantId: "tenant-abc",
  eventType: "dispute_opened",
  slaDeadlineMs: Date.now() + 3_600_000,  // 1 hour
  createdAt: Date.now(),
  urgency: "high",
  jobId: "job-123",
});

const prediction = predictBreach(slaEntry.id);
// {
//   timeRemainingMs: 4_200_000,
//   predictedStatus: "safe",
//   riskScore: 17,              // low risk
// }

getAtRiskSLAs("tenant-abc");
// Returns entries where timeRemaining < 5 minutes or already breached
```

**At-risk threshold:** 5 minutes before deadline.

**Risk score:** 0 (deadline far away) → 100 (breached). Linear interpolation across the at-risk window.

---

## Escalation Timers (`escalation-timer.ts`)

Automated escalation scheduling with event emission:

```typescript
// Schedule 3-tier escalation for a dispute SLA:
scheduleEscalation(slaEntry.id, "tenant-abc", "dispute_opened", 30 * 60_000, 1);  // warn at 30min
scheduleEscalation(slaEntry.id, "tenant-abc", "dispute_opened", 50 * 60_000, 2);  // escalate at 50min
scheduleEscalation(slaEntry.id, "tenant-abc", "dispute_opened", 58 * 60_000, 3);  // emergency at 58min

// Called by worker on each tick:
const fired = await checkAndFireTimers();
// fired=2 → emitted "sla_escalate" events for due timers

getPendingTimers("tenant-abc");  // unfired timers for tenant
cancelTimers(slaEntry.id);       // cancel all timers for resolved SLA
```

Each fired timer emits `"sla_escalate"` via the event fabric → HERALD handler.

---

## Response Scoring (`response-scoring.ts`)

```typescript
scoreResponse("tenant-abc", "dispute_opened", 42_000, 3_600_000);
// {
//   score: 98.8,     // 100 - (42000/3600000) × 100
//   onTime: true,
// }

getResolutionAnalytics("dispute_opened");
// {
//   avgResponseMs: 38_000,
//   p95ResponseMs: 95_000,
//   onTimeRate: 0.97,
//   avgScore: 97.3,
//   sampleCount: 47,
// }

getTopEventsByBreachRate();
// Sorted by breach rate desc — identifies which event types are most at-risk
```

---

## SLA Priority Routing (`priority-routing.ts`)

```typescript
resolvePriorityRoute("sla_breach", "tenant-abc");
// { urgency: "emergency", priorityBoost: +30, maxQueueWaitMs: 1_000, dedicatedWorker: true }

computeEffectivePriority(70, "dispute_opened");
// 70 + 20 = 90 (high priority route)

// Register tenant-specific override:
registerPriorityRoute({
  eventType: "payment_failed",
  tenantId: "enterprise-tenant",
  urgency: "emergency",
  priorityBoost: 30,
  maxQueueWaitMs: 1_000,
  dedicatedWorker: true,
});
```

**Default routes:**

| Event | Urgency | Boost | Max Wait |
|---|---|---|---|
| sla_breach | emergency | +30 | 1s |
| dispute_opened | high | +20 | 5s |
| payment_failed | high | +15 | 10s |

---

## SLA Events

| Event | Trigger | Handler |
|---|---|---|
| `sla_escalate` | Timer level 1 | HERALD warning |
| `sla_escalate` | Timer level 2 | HERALD escalation |
| `sla_escalate` | Timer level 3 | Emergency escalation |

---

## SLA Contract Targets

| Tier | Queue Wait | Escalation Response |
|---|---|---|
| Standard | < 30s | < 60 min |
| Premium | < 5s | < 30 min |
| Enterprise | < 1s | < 10 min |
