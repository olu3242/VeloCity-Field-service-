# VeloCity AI Feedback Loops

## What Are Feedback Loops?

Feedback loops close the gap between AI recommendations and operational outcomes. They track whether AI suggestions are accepted, rejected, overridden, and ultimately whether they lead to positive results.

```
AI recommendation generated (IVY, QUINN, REX, ...)
        ↓
Operator accepts OR rejects OR overrides
        ↓
recordFeedback() → FeedbackRecord stored
        ↓
Outcome observed (dispute resolved, payment captured, etc.)
        ↓
recordFeedback({ feedbackType: "outcome_positive" | "outcome_negative" })
        ↓
getFeedbackSummary(domain) → acceptanceRate, overrideRate, effectiveness
```

---

## Feedback Record Structure

```typescript
recordFeedback({
  domain: "dispute",
  recommendationId: "rec-ivy-dispute-abc123",
  feedbackType: "recommendation_accepted",
  agentName: "IVY",
  tenantId,
  impact: "positive",
  metadata: { resolution: "refund_customer", confidence: 0.87 },
});
```

### Feedback Types

| Type | When Recorded |
|---|---|
| `recommendation_accepted` | Operator follows AI recommendation |
| `recommendation_rejected` | Operator rejects (follows different path) |
| `override_by_admin` | Admin manually overrides AI decision |
| `outcome_positive` | Final outcome was favorable |
| `outcome_negative` | Final outcome was unfavorable |
| `escalation_resolved` | Escalation successfully resolved |
| `escalation_failed` | Escalation did not resolve the situation |

---

## Feedback Summary

```typescript
const summary = getFeedbackSummary("dispute");
// {
//   domain: "dispute",
//   totalFeedback: 142,
//   acceptanceRate: 0.78,        // 78% of IVY recommendations accepted
//   overrideRate: 0.12,          // 12% manually overridden
//   positiveOutcomeRate: 0.91,   // 91% of accepted recommendations had positive outcomes
//   agentEffectiveness: { "IVY": 0.89, "GABRIEL": 0.95 }
// }
```

### Key Metrics

**Acceptance Rate** — Are operators trusting AI recommendations? Low rate (<0.5) signals agent calibration issues.

**Override Rate** — How often do operators deviate from AI? High rate (>0.3) triggers an insight: "Recommendations for {domain} frequently overridden."

**Positive Outcome Rate** — Of accepted recommendations, what % led to good outcomes? This is the ground truth of AI effectiveness.

**Agent Effectiveness** — Per-agent score (0-1) based on positive feedback ratio. Used to weight agent recommendations and inform registry `status` decisions.

---

## Top Insights

`getTopInsights(limit)` derives actionable findings:

- If override rate > 30%: "Recommendations misaligned with operator decisions — review threshold configuration"
- If acceptance rate < 50%: "Agent recommendations not being followed — consider retraining or threshold adjustment"
- If positive outcome rate > 85%: "{domain} automation highly effective — consider expanding auto-resolution threshold"

---

## Feeding Back into AI

Current state: Feedback records are stored and surfaced in admin reports.

**Roadmap (Wave 7):**
- Agent effectiveness scores inform `AGENT_REGISTRY` status updates
- Low-effectiveness agents get their `max_tokens` reduced (budget conservation)
- High override-rate domains get `humanInTheLoop: true` added to their workflows automatically (via admin approval)
- Feedback patterns feed into `hydrateContext()` to prime agents with historical calibration data

---

## Integration Points

Feedback should be recorded at:
1. **Admin dispute detail page** — when admin approves/rejects IVY recommendation
2. **Workflow HITL step** — when operator resolves an approval request
3. **Runtime override API** — when `POST /api/admin/runtime { action: "operator_override" }` is called
4. **Outcome events** — when `dispute_resolved`, `payout_released`, `job_completed` events process successfully
