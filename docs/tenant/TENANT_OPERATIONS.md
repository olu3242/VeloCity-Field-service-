# VeloCity Tenant Operations

## Overview

The tenant operations layer (`src/lib/tenant-ops/`) provides per-tenant health scoring, workload isolation enforcement, runtime analytics, automation controls, and throttling — ensuring fair, governed, and observable multi-tenant operation.

---

## Health Scoring (`health-scorer.ts`)

```typescript
scoreTenantHealth("tenant-abc", {
  automationRate: 0.92,
  paymentSuccessRate: 0.98,
  slaComplianceRate: 0.95,
  workflowSuccessRate: 0.97,
});
// {
//   compositeScore: 95.5,
//   grade: "A",
//   recommendations: [],
// }

getHealthTrend("tenant-abc");  // "improving" | "stable" | "degrading"
getUnhealthyTenants(70);       // tenants with compositeScore < 70
```

**Grading:** ≥ 90 = A | ≥ 80 = B | ≥ 70 = C | ≥ 60 = D | < 60 = F

Dimensions below 70% auto-generate specific recommendations (e.g. "Investigate SLA compliance — 62% is below threshold").

---

## Workload Isolation (`workload-isolation.ts`)

```typescript
setIsolationConfig({
  tenantId: "enterprise-tenant",
  maxConcurrentEvents: 50,
  maxQueueDepth: 200,
  priorityLevel: "priority",
  isolatedWorker: true,
  resourceNamespace: "enterprise-tenant-ns",
});

checkIsolationBounds("enterprise-tenant", 55, 80);
// { allowed: false, violations: ["Concurrent events 55 exceeds limit 50"] }

recordViolation({
  tenantId: "enterprise-tenant",
  violationType: "concurrency_exceeded",
  detail: "55 concurrent events vs limit 50",
  detectedAt: new Date().toISOString(),
});
```

Default limits (unregistered tenants): 10 concurrent events, 50 queue depth, standard priority.

---

## Runtime Analytics (`runtime-analytics.ts`)

```typescript
recordTenantMetrics({
  tenantId: "tenant-abc",
  eventsProcessed: 847,
  eventsFailed: 12,
  aiCallsTotal: 234,
  aiCallsSucceeded: 231,
  totalCostUsd: 2.11,
  avgLatencyMs: 1842,
  periodLabel: "2025-05-26T14",
});

getTenantSummary("tenant-abc");
// {
//   successRate: 0.986,
//   aiSuccessRate: 0.987,
//   totalCostUsd: 2.11,
//   efficiency: 98.6,
// }

getTopCostTenants(5);  // highest-spending tenants by total AI cost
```

---

## Automation Controls (`automation-controls.ts`)

```typescript
disableEventType("tenant-abc", "daily_territory_analysis", "Reducing non-critical load");
isEventAllowed("tenant-abc", "daily_territory_analysis");  // false

pauseTenantAutomation("tenant-abc", 30 * 60_000, "Maintenance window");
isEventAllowed("tenant-abc", "payment_failed");  // false (paused)

enableEventType("tenant-abc", "daily_territory_analysis");
getControl("tenant-abc");  // full control state
```

---

## Throttling (`throttle-manager.ts`)

Per-tenant rate limiting with sliding 1-minute windows:

```typescript
checkAndRecordEvent("tenant-abc", 100, 50);  // limit 100 events/min
// { allowed: true }  — if under limit

// After 100 events in window:
checkAndRecordEvent("tenant-abc", 100, 50);
// { allowed: false, reason: "Event rate limit exceeded" }

getThrottledTenants();  // currently throttled tenants
```

Windows auto-reset after 60 seconds. AI call throttling is independent of event throttling.
