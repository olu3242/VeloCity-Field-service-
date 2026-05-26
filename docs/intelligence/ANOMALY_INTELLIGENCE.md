# VeloCity Anomaly Intelligence

## Architecture

VeloCity operates two complementary anomaly detection systems:

1. **Threshold-based detection** (`src/lib/prediction/anomalyDetection.ts`) — rule-based thresholds for queue, payment, and provider metrics
2. **Cluster-based intelligence** (`src/lib/intelligence/anomaly-intelligence.ts`) — pattern clustering that learns from repeated anomalies

```
Anomaly detected by threshold system
        ↓
recordAnomaly(type, category, severity, entityId)
        ↓
Anomaly-intelligence clusters similar anomalies
        ↓
buildIntelligenceReport() → clusters + risk trend + interventions
        ↓
Admin command center displays aggregated intelligence
```

---

## Anomaly Categories

| Category | What It Covers |
|---|---|
| `operational` | Queue depth, worker failures, stuck workflows |
| `financial` | Payment failures, chargebacks, payout anomalies |
| `behavioral` | Suspicious provider/customer activity patterns |
| `technical` | Handler errors, circuit breaker opens, AI failures |
| `security` | Fraud signals, unauthorized access patterns |

---

## Cluster-Based Detection

`recordAnomaly()` groups similar anomalies into `AnomalyCluster` objects:

- First occurrence of type+category → new cluster created
- Subsequent occurrences → `frequency` incremented, `lastSeen` updated, entity added to `correlations`
- Severity escalates as frequency grows

```typescript
// After 3 payment failures from same provider:
recordAnomaly("payment_failure", "financial", "medium", providerId);
recordAnomaly("payment_failure", "financial", "medium", providerId);
recordAnomaly("payment_failure", "financial", "high", providerId);
// → single cluster with frequency: 3, severity: "high", correlations: [providerId]
```

---

## Intelligence Report

`buildIntelligenceReport()` produces a unified view:

```typescript
{
  clusters: [
    {
      clusterId: "...",
      category: "financial",
      anomalyTypes: ["payment_failure"],
      frequency: 7,
      severity: "critical",
      correlations: ["provider-xyz", "provider-abc"],
      recommendedAction: "Immediate fraud review — multiple providers involved",
    }
  ],
  riskTrend: "degrading",   // "improving" | "stable" | "degrading"
  topRisks: ["Payment failure cluster (7 occurrences)", ...],
  recommendedInterventions: [
    { action: "Immediate fraud investigation", priority: "critical", domain: "financial" }
  ]
}
```

**Risk trend logic:**
- Any critical cluster → "degrading"
- High clusters > 2 → "degrading"  
- No high/critical clusters → "stable"

---

## Threshold Anomaly Detection

The rule-based system (`prediction/anomalyDetection.ts`) fires on specific metric thresholds:

### Queue Anomalies
| Condition | Severity |
|---|---|
| Pending items > 200 | Critical |
| Pending items > 50 | High |
| Failed items > 20 | Critical |
| Oldest item > 15 min | High |

### Payment Anomalies
| Condition | Severity |
|---|---|
| Failed payments > 10 in 24h | Critical |
| Chargebacks > 5 in 7 days | Critical |
| Pending payouts > $500K | High |
| Refund rate > 8% in 30 days | High |

### Provider Anomalies
| Condition | Severity |
|---|---|
| No-show rate > 5% | High |
| Dispute rate > 12% | High |
| Offer rejection spike > 30% | Medium |

---

## Anomaly → Autonomous Action Pipeline

| Anomaly | Automatic Action | Human Required? |
|---|---|---|
| Fraud signal detected | GABRIEL scores → account block | Yes (review block) |
| Circuit breaker opens | Self-healing logs reset recommendation | No |
| Queue flood (>200) | Flood protection activates | Monitoring only |
| Payout anomaly critical | Payout hold triggered | Yes (finance review) |
| Provider dispute cluster | REX quality review queued | Yes (approval) |

`clearExpiredClusters(maxAgeHours)` runs periodically to prune stale anomaly data (default: 48h).
