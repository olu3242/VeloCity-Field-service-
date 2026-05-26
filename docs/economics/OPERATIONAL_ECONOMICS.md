# VeloCity Operational Economics

## Overview

The economics layer (`src/lib/economics/`) measures the financial value of automation — translating event throughput, AI execution, and workflow completions into concrete ROI metrics.

---

## ROI Calculation (`roi.ts`)

```typescript
const roi = calculateROI({
  eventsAuto: 847,
  eventsTotal: 900,
  aiCostUsd: 2.11,
  periodLabel: "2025-05-26 14:00",
});
// {
//   eventsAutoProcessed: 847,
//   estimatedManualHoursAvoided: 211.75,   // 847 × 0.25h
//   estimatedLaborCostAvoided: 7411.25,    // 211.75h × $35/hr
//   aiExecutionCostUsd: 2.11,
//   netROIUsd: 7409.14,
//   roiMultiplier: 3513.4,                 // labor / aiCost
//   automationRate: 0.941,
//   periodLabel: "2025-05-26 14:00",
// }
```

**Assumptions:**
- 0.25 hours (15 min) of manual handling avoided per automated event
- $35/hr blended labor rate
- ROI multiplier = laborAvoided / aiCost (capped at 9999 when aiCost ≈ 0)

---

## Workflow Efficiency (`roi.ts`)

```typescript
const efficiency = scoreWorkflowEfficiency({
  workflowId: "dispute-resolution",
  completions: 18,
  failures: 0,
  totalDurationMs: 1_620_000,
  humanInterventions: 2,
  totalCostUsd: 0.30,
});
// {
//   efficiencyScore: 88,   // weighted: success 40%, speed 20%, human 25%, cost 15%
//   successRate: 1.0,
//   humanInterventionRate: 0.11,
//   avgDurationMs: 90_000,
//   avgCostUsd: 0.017,
// }
```

---

## Aggregate ROI Summary

```typescript
getROISummary(roiList);
// {
//   totalNetROIUsd: 44_254.84,
//   avgMultiplier: 1847.2,
//   bestPeriod: "2025-05-26 14:00"
// }
```

---

## Business Health Scoring (`business-health.ts`)

`scoreTenantHealth(metrics)` returns a letter grade (A–F) based on 5 weighted dimensions:

| Dimension | Weight | Formula |
|---|---|---|
| Automation rate | 25% | % events auto-processed |
| Payment success | 25% | 1 − failureRate |
| SLA compliance | 20% | 1 − breachRate |
| Dispute rate | 15% | 1 − disputeRate |
| Provider retention | 15% | retentionRate |

```
Score ≥ 90 → A
Score ≥ 80 → B
Score ≥ 70 → C
Score ≥ 60 → D
Score < 60 → F
```

Recommendations are auto-generated for any dimension scoring below 60%.

---

## Cost Analytics (`cost-analytics.ts`)

### Queue Cost Analysis

```typescript
analyzeQueueCosts({ totalEvents: 1000, failedEvents: 30, retriedEvents: 50, avgAiCostPerEvent: 0.0166 });
// {
//   directCostUsd: 16.60,
//   retryOverheadUsd: 1.245,    // 50 retries × $0.0166 × 1.5 factor
//   totalQueueCostUsd: 17.845,
//   costPerSuccessfulEvent: 0.0184,
//   retryOverheadPct: 7.0
// }
```

### Dispute Cost Analysis

```typescript
analyzeDisputeCosts({ totalDisputes: 10, autoResolved: 7, escalated: 3, avgResolutionMs: 3_600_000 });
// {
//   disputeOpsEstimateUsd: 700,   // 10 × $70 per dispute
//   escalationCostMultiplier: 2.5,
//   totalDisputeCostUsd: 875,
//   avgResolutionHours: 1.0,
//   satisfactionImpact: -0.21   // penalty for unresolved disputes
// }
```

---

## Executive Metrics (`business-health.ts`)

`buildExecutiveMetrics(snapshot, roi)` produces a board-level summary:

```typescript
{
  operationalROI: "847 events auto-processed → $7,409 net ROI (3513× multiplier)",
  aiValueScore: 94,            // 0-100: AI calls succeeded × efficiency
  platformEfficiency: 88,
  costEfficiencyGrade: "A",
  keyInsights: [
    "High ROI multiplier indicates strong automation leverage",
    "Provider network health critical — below 70%"
  ]
}
```
