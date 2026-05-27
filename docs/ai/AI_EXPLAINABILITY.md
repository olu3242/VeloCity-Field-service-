# VeloCity AI Explainability

## Overview

The AI explainability layer (`src/lib/explainability/`) captures step-by-step reasoning traces, decision audit trails, and human-readable narratives for every AI agent action — enabling compliance audits, regulator review, and operator oversight.

---

## Reasoning Log (`reasoning-log.ts`)

Captures structured reasoning for every AI decision:

```typescript
logReasoning({
  agentName: "IVY",
  eventType: "dispute_opened",
  decision: "escalate_to_human",
  reasoning: [
    "Dispute amount $12,000 exceeds auto-resolve threshold",
    "Provider has 2 prior disputes in 30 days",
    "Confidence 0.72 below auto-resolve threshold 0.95",
  ],
  confidence: 0.72,
  evidenceKeys: ["dispute.amount", "provider.disputeHistory"],
  tenantId: "tenant-abc",
});

getReasoningByAgent("IVY", 20);
getReasoningByDecision("escalate_to_human", 20);
getRecentReasoning(20);
searchReasoning("prior disputes");  // full-text search in reasoning + decision
```

**Cap:** 1,000 entries (rolling).

---

## Decision Trace (`decision-trace.ts`)

Step-by-step trace of an AI decision pipeline:

```typescript
const trace = startTrace("IVY", "dispute_opened", "tenant-abc");

addTraceStep(trace.id, {
  step: "policy_check",
  result: "allow",
  durationMs: 12,
});
addTraceStep(trace.id, {
  step: "confidence_evaluation",
  result: "0.72 — below auto-resolve threshold",
  durationMs: 8,
});

finalizeTrace(trace.id, "escalate_to_human", 0.72);

getTrace(trace.id);
// { steps: [...], finalDecision, confidence, durationMs }
```

**Cap:** 500 traces.

---

## Audit Narrative (`audit-narrative.ts`)

Generates human-readable 1–3 sentence audit summaries:

```typescript
generateNarrative({
  agentName: "IVY",
  eventType: "dispute_opened",
  decision: "escalate_to_human",
  reasoning: [
    "Dispute amount $12,000 exceeds auto-resolve threshold",
    "Provider has 2 prior disputes",
  ],
  confidence: 0.72,
  tenantId: "tenant-abc",
  actionTaken: "Escalated to human review queue",
});
// {
//   narrative: "IVY processed dispute_opened and decided to escalate_to_human. Dispute amount $12,000 exceeds auto-resolve threshold. Confidence: 72%.",
//   keyFactors: ["Dispute amount...", "Provider has..."],
//   confidenceStatement: "Moderate confidence (0.72)",
// }

getRecentNarratives("IVY", 20);
exportNarrativesForTenant("tenant-abc");
```

**Cap:** 500 narratives.

---

## Explainability Pipeline

```
dispatchAgent("IVY", prompt, context)
    ↓
startTrace(...)
    ↓
addTraceStep(...) × N
    ↓
logReasoning(...)
    ↓
finalizeTrace(...)
    ↓
generateNarrative(...)
```

All AI decisions produce a reasoning log entry, a decision trace, and a human-readable audit narrative.
