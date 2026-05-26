# VeloCity Operational Analytics

## Overview

The analytics layer (`src/lib/analytics/`) provides workflow performance analysis, provider scoring, payout/dispute reporting, and live throughput dashboards — all sourced exclusively from canonical runtime data (telemetry snapshots, queue status, execution metrics).

---

## Workflow Analytics (`workflow-analytics.ts`)

```typescript
recordWorkflowRun({
  workflowId: "dispute-resolution",
  eventType: "dispute_opened",
  startedAt: "2025-05-26T10:00:00Z",
  completedAt: "2025-05-26T10:00:45Z",
  durationMs: 45_000,
  success: true,
  humanInterventionRequired: false,
  agentsInvolved: ["GABRIEL", "IVY"],
  tenantId: "tenant-abc",
  costUsd: 0.017,
});

getWorkflowAnalytics("dispute-resolution");
// {
//   totalRuns: 47,
//   successRate: 0.979,
//   avgDurationMs: 38_000,
//   p95DurationMs: 92_000,
//   humanInterventionRate: 0.128,
//   avgCostUsd: 0.016,
// }

getEffectivenessScore();  // from telemetry.calculateEffectiveness().composite
```

---

## Provider Analytics (`provider-analytics.ts`)

```typescript
recordProviderMetric({
  providerId: "provider-123",
  tenantId: "tenant-abc",
  jobsCompleted: 45,
  jobsFailed: 2,
  avgRating: 4.6,
  avgResponseMs: 1_200,
  disputeRate: 0.02,
  lastActiveAt: new Date().toISOString(),
  periodLabel: "2025-05",
});

analyzeProvider("provider-123");
// {
//   performanceScore: 95.7,    // (1 - 2/47) × 100
//   reliabilityScore: 96.0,    // 100 - 0.02×200
//   satisfactionScore: 92.0,   // 4.6/5 × 100
//   compositeScore: 94.6,
//   tier: "top",
// }
```

**Provider tiers:** composite ≥ 85 = top | ≥ 65 = standard | ≥ 40 = at_risk | < 40 = suspended

```typescript
getAtRiskProviders();   // tier "at_risk" or "suspended" across all tenants
getTopProviders("tenant-abc", 5);  // top 5 providers by composite score
```

---

## Payout + Dispute Analytics (`payout-dispute-analytics.ts`)

```typescript
getPayoutAnalytics("tenant-abc");
// {
//   totalPayouts: 284,
//   successRate: 0.989,
//   avgProcessingMs: 2_100,
//   totalVolumeUsd: 142_500,
// }

getDisputeAnalytics("tenant-abc");
// {
//   totalDisputes: 12,
//   autoResolvedRate: 0.75,
//   avgResolutionMs: 38_000,
//   winRate: 0.58,
//   totalValueUsd: 8_400,
// }

getPlatformDisputeRate();  // total disputes / total payouts (global rate)
```

---

## Throughput Dashboard (`throughput-dashboard.ts`)

Live throughput snapshots sourced from queue status + telemetry:

```typescript
captureThroughputSnapshot();
// {
//   timestamp: "2025-05-26T14:30:00Z",
//   eventsPerMinute: 12,
//   queueDepth: 45,
//   activeWorkers: 3,
//   failureRate: 0.02,
//   effectivenessScore: 91,
// }

getThroughputTrend();
// "improving" | "stable" | "degrading"
// Based on last-5 vs previous-5 eventsPerMinute average (±10% threshold)

getEffectivenessReport();
// {
//   current: 91,
//   trend: "stable",
//   recommendation: "Excellent — maintain current config"
// }
```

---

## Analytics Sourcing Guarantee

All analytics are derived from canonical runtime sources only:

| Metric | Source |
|---|---|
| Effectiveness score | `economy/telemetry.calculateEffectiveness()` |
| Queue throughput | `realtime/queue-stream.getCurrentStatus()` |
| Workflow runs | Recorded at handler completion |
| Provider metrics | Recorded at job completion |
| Payout/dispute records | Recorded by FINN/IVY handlers |

No analytics module queries the database directly or maintains independent state inconsistent with the runtime.
