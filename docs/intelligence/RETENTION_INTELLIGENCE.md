# VeloCity Retention Intelligence

## Overview

The retention intelligence layer (`src/lib/intelligence/retention/`) applies predictive analytics to provider and customer activity signals — identifying at-risk entities before they churn and enabling proactive intervention.

---

## Churn Prediction (`churn-predictor.ts`)

```typescript
predictChurn({
  entityId: "provider-123",
  entityType: "provider",
  daysSinceLastActivity: 21,
  activitySignals: ["missed_job", "negative_review", "complaint_filed"],
  historicalEngagementScore: 45,
});
// {
//   churnRiskScore: 72,
//   riskLevel: "high",
//   primaryReason: "Extended inactivity (21 days)",
//   recommendedAction: "Targeted re-engagement campaign",
//   predictedChurnDate: "2025-06-09"  // 14 days from now
// }
```

**Scoring formula:**
- Base score from inactivity days (0–40 points)
- Signal penalties: `missed_job` +10, `negative_review` +8, `complaint_filed` +15, etc.
- Engagement modifier: low historical score adds up to +20
- Capped at 100

---

## Bulk Churn Detection

```typescript
detectProviderInactivity(providers);
// Returns providers sorted by inactivityScore (highest first)

detectCustomerDropoff(customers);
// Returns customers sorted by dropoffScore (highest first)
```

Useful for batch retention campaigns — identify top-N at-risk entities weekly.

---

## Engagement Scoring (`engagement-scorer.ts`)

Four-component score for lifecycle classification:

| Component | Weight | Factors |
|---|---|---|
| Activity | 30% | Jobs completed, recency |
| Quality | 30% | Average rating (normalized) |
| Satisfaction | 20% | Low support tickets = high score |
| Loyalty | 20% | Platform tenure (90-day target) |

```typescript
scoreEngagement({
  entityId: "customer-456",
  entityType: "customer",
  jobsCompleted: 8,
  daysSinceLastJob: 5,
  avgRating: 4.5,
  supportTickets: 1,
  platformTenure: 180,
});
// {
//   score: 79,
//   lifecycleStage: "active",
//   trend: "stable",
//   components: { activity: 78, quality: 88, satisfaction: 75, loyalty: 80 }
// }
```

---

## Lifecycle Stages

| Stage | Score Range | Condition | Action |
|---|---|---|---|
| `onboarding` | Any | Tenure < 30 days | Onboarding flow |
| `active` | ≥ 60 | Recent activity | Nurture |
| `at_risk` | 40–59 | — | Re-engagement |
| `dormant` | < 40 | No recent jobs | Winback campaign |
| `churned` | Any | > 60 days inactive | Final outreach |

---

## Integration with Automation

Churn signals can feed directly into the automation event fabric:

```typescript
// Scheduled job (daily):
const atRisk = detectProviderInactivity(providers)
  .filter(p => p.inactivityScore > 60);

for (const provider of atRisk) {
  await emitEvent("agent_run", {
    agentHint: "ARIA",
    context: { providerId: provider.entityId, reason: "churn_risk" },
  });
}
```

ARIA generates personalized re-engagement communication based on the provider's history and risk profile.
