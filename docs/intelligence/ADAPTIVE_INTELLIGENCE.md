# VeloCity Adaptive Intelligence

## Overview

The adaptive intelligence layer (`src/lib/intelligence/`) continuously improves operational behavior by learning from outcomes, optimizing decisions, and detecting anomaly patterns — without autonomously mutating platform behavior.

```
Event processed → Outcome recorded → Pattern analyzed → Signal generated
                                                              ↓
                                               Signal fed to: 
                                               • Decision optimizer
                                               • Agent context hydration
                                               • Admin recommendations
                                               • Workflow evolution suggestions
```

---

## Learning Engine (`intelligence/learning-engine.ts`)

### Workflow Outcome Tracking

Every workflow execution records an `WorkflowOutcome`:

```typescript
recordOutcome({
  workflowId: "dispute-resolution-v1",
  outcomeType: "dispute_resolved",
  durationMs: 145_000,
  stepsCompleted: 7,
  stepsFailed: 1,
  humanInterventions: 1,
  aiDecisions: 2,
  finalStatus: "success",
  metadata: { resolution: "refund_customer" },
});
```

### Learning Signal Generation

`analyzeWorkflow(workflowId)` examines accumulated outcomes and produces `LearningSignal` recommendations:

| Signal | Trigger | Confidence |
|---|---|---|
| `increase_timeout` | Avg duration > 5 min across ≥3 runs | 0.7 |
| `add_human_gate` | Step failure rate > 30% | 0.8 |
| `remove_human_gate` | 0 human interventions, 100% success | 0.6 |
| `optimize_path` | High failure → success ratio on retry | 0.75 |

Signals are advisory — they surface in admin recommendations, they don't auto-modify workflows.

---

## Decision Optimization (`intelligence/decision-optimization.ts`)

Domain-specific routing and strategy optimization:

```typescript
const rec = optimizeDecision({
  domain: "dispute_routing",
  entityId: dispute.id,
  tenantId,
  currentStrategy: "human_review",
  signals: { trust_score: 82, days_open: 1, evidence_count: 3 },
});
// → { recommendedStrategy: "auto_resolve", confidence: 0.85, estimatedImpact: "high" }
```

### Optimization Domains

| Domain | Signals Used | Output |
|---|---|---|
| `dispute_routing` | trust_score | auto_resolve vs human_review |
| `escalation_timing` | days_open | immediate vs scheduled vs monitor |
| `payout_prioritization` | trust_score, dispute_rate | priority / standard / hold |
| `retry_strategy` | retry_count | immediate / standard / extended backoff |
| `provider_intervention` | trust_score | suspend / coaching / monitor |
| `workflow_path` | step_failure_rate, duration | path optimization signal |

---

## Adaptive Workflow Evolution

Workflows do NOT auto-mutate. The intelligence layer:

1. Records outcomes
2. Generates signals with reasoning
3. Surfaces recommendations to admins
4. Admins update workflow definitions with informed changes

This keeps governance intact while enabling data-driven improvement.

**Example flow:**
- dispute-resolution-v1 has high timeout rate (detected by `analyzeWorkflow`)
- Signal: `increase_timeout` with 0.7 confidence
- Admin receives recommendation in command center
- Admin updates `DISPUTE_RESOLUTION_WORKFLOW.steps[3].timeoutMs` after review
- New timeout tested in staging, deployed to production

---

## Intelligence Layer Files

| File | Responsibility |
|---|---|
| `learning-engine.ts` | Workflow outcome recording + signal generation |
| `decision-optimization.ts` | Domain-specific strategy recommendations |
| `feedback-loops.ts` | Closed-loop acceptance/override tracking |
| `anomaly-intelligence.ts` | Anomaly clustering + intelligence reports |
