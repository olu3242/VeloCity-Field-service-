# VeloCity Ecosystem Intelligence

## Overview

Ecosystem intelligence aggregates cross-layer signals — retention, engagement, operational health, and simulation — into a unified platform picture. It answers: "Is the platform's ecosystem healthy and growing?"

---

## Intelligence Sources

| Layer | Module | Signal |
|---|---|---|
| Retention | `intelligence/retention/churn-predictor.ts` | Provider/customer churn risk |
| Engagement | `intelligence/retention/engagement-scorer.ts` | Lifecycle stage, trend |
| Economics | `economics/business-health.ts` | Health grade, ROI |
| Simulation | `simulation/resilience-tester.ts` | Resilience score |
| Telemetry | `economy/telemetry.ts` | Effectiveness composite |
| Anomaly | `prediction/anomalyDetection.ts` | Active anomalies |

---

## Retention Intelligence

### Churn Prediction

```typescript
predictChurn({
  entityId: "provider-123",
  entityType: "provider",
  daysSinceLastActivity: 21,
  activitySignals: ["missed_job", "negative_review"],
  historicalEngagementScore: 45,
});
// {
//   entityId: "provider-123",
//   churnRiskScore: 68,
//   riskLevel: "high",
//   primaryReason: "Extended inactivity (21 days)",
//   recommendedAction: "Targeted re-engagement campaign"
// }
```

**Risk thresholds:**
- `critical` (80+): Immediate intervention required
- `high` (60–79): Targeted outreach within 24h
- `medium` (40–59): Scheduled re-engagement
- `low` (<40): Monitor

### Engagement Scoring

```typescript
scoreEngagement({
  entityId: "customer-456",
  entityType: "customer",
  jobsCompleted: 3,
  daysSinceLastJob: 14,
  avgRating: 4.2,
  supportTickets: 0,
  platformTenure: 90,
});
// {
//   score: 62,
//   lifecycleStage: "active",
//   trend: "declining",
//   components: { activity: 55, quality: 70, satisfaction: 80, loyalty: 45 }
// }
```

**Lifecycle stages:** `onboarding` → `active` → `at_risk` → `dormant` → `churned`

---

## Platform Ecosystem Health

A healthy ecosystem requires:

1. **Provider supply** — churn rate < 5%/month, engagement trend stable
2. **Customer demand** — repeat job rate > 60%, satisfaction > 4.0
3. **Operational reliability** — composite effectiveness > 90%
4. **Financial sustainability** — ROI multiplier > 100×

---

## Alerting

| Signal | Threshold | Action |
|---|---|---|
| High-risk churn entities | > 10% of active base | Campaign trigger |
| Lifecycle stage at_risk | Provider engagement trend negative | Proactive outreach |
| Dormant providers | > 30 days inactive | Winback sequence |
| Engagement composite decline | 3 consecutive snapshots | Platform review |
