# VeloCity AI Feedback Loops

## Overview

The feedback loop system (`src/lib/intelligence/feedback-loops.ts`) closes the loop between AI recommendations and operational outcomes — continuously measuring whether the AI layer is generating genuine value.

---

## Feedback Record Types

| Type | Meaning |
|---|---|
| `recommendation_accepted` | Admin or automation accepted AI recommendation |
| `recommendation_rejected` | Admin overrode AI recommendation |
| `override_by_admin` | Human manually corrected AI-suggested action |
| `outcome_positive` | AI-recommended action led to good outcome |
| `outcome_negative` | AI-recommended action led to bad outcome |
| `no_action_taken` | AI flagged something but no action was taken |

---

## Recording Feedback

```typescript
recordFeedback({
  domain: "dispute-resolution",
  agentName: "IVY",
  feedbackType: "outcome_positive",
  context: "Auto-resolved dispute saved 45 min manual review",
});
```

---

## Feedback Summary

```typescript
getFeedbackSummary("dispute-resolution");
// {
//   domain: "dispute-resolution",
//   acceptanceRate: 0.87,
//   overrideRate: 0.08,
//   positiveOutcomeRate: 0.91,
//   totalSignals: 47,
//   agentEffectiveness: {
//     "IVY": { acceptanceRate: 0.90, positiveOutcomeRate: 0.94, totalFeedback: 23 }
//   }
// }
```

---

## Adaptive Loop Integration

The feedback summary feeds the learning engine:

```
Feedback summary (acceptanceRate, positiveOutcomeRate)
    ↓
Learning engine detects low acceptance (< 60%) or negative outcomes
    ↓
Generates TuningSignal: "add_human_gate" for that domain
    ↓
Safe adaptation proposes change (medium risk → human approval)
    ↓
If approved: human gate added to workflow DSL for that domain
```

---

## Override Tracking

High override rates (> 20%) signal misaligned AI behavior and trigger:

1. `learning-engine.ts` signal: `add_human_gate` with confidence 0.8
2. `safe-adaptation.ts` proposal at `medium` risk level
3. Admin dashboard alert: "AI override rate elevated for [domain]"

---

## Domains

Feedback is tracked per domain. Recommended domains:

- `dispute-resolution` — IVY dispute handling
- `payment-recovery` — FINN payment retry logic
- `provider-matching` — MAX provider recommendations
- `anomaly-detection` — GABRIEL flagging accuracy
- `sla-management` — HERALD escalation decisions
