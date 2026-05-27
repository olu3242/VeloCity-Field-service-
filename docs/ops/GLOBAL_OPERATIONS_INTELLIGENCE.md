# VeloCity Global Operations Intelligence

## Overview

The global intelligence layer (`src/lib/global-intelligence/`) surfaces anonymized cross-tenant insights, benchmarks tenant metrics against platform averages, and detects ecosystem-wide anomalies — without exposing raw tenant data.

---

## Cross-Tenant Insights (`cross-tenant-insights.ts`)

Anonymized platform-wide operational intelligence:

```typescript
recordInsight({
  insightType: "trend",
  title: "Dispute rate declining across enterprise tier",
  summary: "Enterprise tenants show 15% lower dispute rate this month.",
  affectedTenantCount: 12,
  confidenceScore: 0.88,
  tags: ["dispute", "enterprise", "trend"],
});

getInsightsByType("trend");      // trend | anomaly | benchmark | forecast
getRecentInsights(20);

generatePlatformSummary();
// {
//   totalInsights: 47,
//   byType: { trend: 18, anomaly: 12, benchmark: 9, forecast: 8 },
//   avgConfidence: 0.84,
//   topTags: ["dispute", "payment", "sla", "enterprise", "automation"],
// }
```

**Cap:** 200 insights.

---

## Platform Benchmarking (`benchmarking.ts`)

Compare tenant metrics to platform percentiles:

```typescript
recordBenchmark("dispute_resolution_ms", 38_000);
recordBenchmark("dispute_resolution_ms", 42_000);

compareToP50("tenant-abc", "dispute_resolution_ms", 35_000);
// { metric, tenantValue, p50, p75, p95, percentileRank: "above_p50" }

getBenchmarkReport("dispute_resolution_ms");
// { p50, p75, p95, sampleCount, lastUpdatedAt }
```

Cap: 200 samples per metric. Percentiles computed from the full sample set.

---

## Ecosystem Anomaly Detection (`ecosystem-anomaly.ts`)

Detects statistically significant deviations across the platform:

```typescript
detectAnomaly("payment_failure_rate", 0.45, 0.12, 8);
// deviationPct = 275% → "spike", severity: "critical"
// returns EcosystemAnomaly or null (if deviation < 20%)

resolveAnomaly(anomaly.id);

getActiveAnomalies();
// { id, anomalyType: "spike"|"drop"|"pattern_shift"|"cascade", metric, deviationPct, severity, ... }

getAnomalySummary();
// { total: 12, active: 4, bySeverity: { critical: 2, high: 1, medium: 1 } }
```

**Detection threshold:** 20% deviation from expected. Anomaly types: `spike` (>2× expected), `drop` (<0.5× expected), `pattern_shift` (between).

**Severity:** critical (>100% deviation) | high (>50%) | medium (>30%) | low (>20%)
