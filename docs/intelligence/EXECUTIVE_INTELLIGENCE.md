# VeloCity Executive Intelligence

## Overview

The executive intelligence layer (`src/lib/executive-intelligence/`) synthesizes operational data into C-suite summaries, forward-looking KPI forecasts, and predictive alerts — giving leadership actionable visibility into platform health, cost trajectory, and risk exposure.

---

## Operational Summary (`operational-summary.ts`)

```typescript
generateSummary({
  automationROIUsd: 48_200,
  incidentsOpen: 2,
  slaComplianceRate: 0.97,
  topRisks: ["Payment processor latency elevated", "Two open sev2 incidents"],
  topOpportunities: ["Dispute automation rate 94% — room for 3% gain"],
});
// {
//   period: "2025-05-27T14:30",
//   platformHealth: 88,          // from scoreOperationalReadiness()
//   aiEffectivenessScore: 91,    // from calculateEffectiveness()
//   automationROIUsd: 48_200,
//   incidentsOpen: 2,
//   slaComplianceRate: 0.97,
//   topRisks: [...],
//   topOpportunities: [...],
// }

getLatestSummary();
getSummaryHistory(10);

getPlatformHealthTrend();
// "improving" | "stable" | "declining"
// compares avg of last 3 summaries vs prior 3 — delta > 2 = improving/declining
```

**Cap:** 100 summaries.

---

## KPI Synthesizer (`kpi-synthesizer.ts`)

```typescript
synthesizeKPIs({
  eventsProcessed: 8_472,
  eventsFailed: 84,
  aiCallsTotal: 2_340,
  aiCallsSucceeded: 2_317,
  avgLatencyMs: 1_842,
  totalCostUsd: 21.10,
  automationRate: 0.94,
});
// {
//   successRate: 0.990,
//   aiSuccessRate: 0.990,
//   costPerEvent: 0.00249,
//   automationRate: 0.94,
//   efficiency: "A",
// }

getKPITrend("successRate");  // "improving" | "stable" | "declining"
```

---

## Predictive Alerts (`predictive-alerts.ts`)

Forward-looking alerts before problems materialize:

```typescript
generateCapacityAlert(queueDepth, workerCount);
// returns alert if ratio >= 0.7 (queue depth / (workers × 50))
// null if below threshold

generateCostAlert(projectedCostUsd, budgetUsd);
// returns alert if projected >= 80% of budget
// null otherwise

getActiveAlerts("capacity");
// all unacknowledged capacity alerts

acknowledgeAlert(alertId);
```

**Alert types:** `capacity` | `cost_overrun` | `sla_risk` | `churn_risk` | `fraud_risk`

**Impact levels:** critical | high | medium | low

**Cap:** 200 alerts.
