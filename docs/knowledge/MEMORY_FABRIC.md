# VeloCity Knowledge + Memory Fabric

## Overview

The knowledge layer (`src/lib/knowledge/`) provides operational memory indexing, escalation pattern tracking, and AI recommendation history — enabling the platform to learn from past actions and make better decisions over time.

---

## Operational Memory (`operational-memory.ts`)

Stores structured records of every significant operational action:

```typescript
storeMemory({
  category: "dispute_resolution",
  tenantId: "tenant-abc",
  summary: "IVY auto-resolved dispute disp-123 — full refund issued",
  outcome: "success",
  agentInvolved: "IVY",
  contextKeys: ["disp-123", "job-456", "refund"],
  metadata: { amount: 15000, resolutionMs: 45_000 },
});

searchMemory({
  category: "dispute_resolution",
  tenantId: "tenant-abc",
  outcome: "success",
  contextKey: "refund",
  limit: 10,
});

getMemoryStats();
// { total: 847, byCategory: { dispute_resolution: 120, ... }, successRate: 0.94 }
```

**Categories:** `dispute_resolution`, `payment_recovery`, `sla_management`, `provider_action`, `anomaly_response`, `workflow_completion`

Memory cap: 2,000 entries. Oldest entries evicted when full.

---

## Escalation History (`escalation-history.ts`)

Tracks all escalation events with resolution data:

```typescript
const rec = recordEscalation({
  tenantId: "tenant-abc",
  triggerEvent: "dispute_opened",
  escalatedTo: "IVY",
  reason: "High-value dispute requires AI review",
  outcome: "pending",
});

resolveEscalation(rec.id, "IVY", "resolved");
// resolutionMs calculated from createdAt to now

getEscalationPatterns();
// [
//   { triggerEvent: "dispute_opened", count: 47, avgResolutionMs: 38_000, mostCommonOutcome: "resolved" },
//   { triggerEvent: "payment_failed", count: 23, avgResolutionMs: 12_000, mostCommonOutcome: "resolved" }
// ]
```

Patterns reveal which event types require the most escalation effort and where automation can be improved.

---

## AI Recommendation Memory (`ai-recommendation-memory.ts`)

Tracks AI suggestions with acceptance and outcome data:

```typescript
const rec = storeRecommendation({
  agentName: "IVY",
  domain: "dispute-resolution",
  recommendation: "Issue full refund — customer evidence is conclusive",
  confidence: 0.92,
});

recordAcceptance(rec.id, true);   // admin accepted
recordOutcome(rec.id, "positive");  // outcome was good

getAcceptanceStats("dispute-resolution");
// {
//   acceptanceRate: 0.87,
//   positiveOutcomeRate: 0.91,
//   totalRecommendations: 47
// }
```

Low acceptance rates (< 60%) in a domain trigger learning engine signals to add human gates to that workflow.

---

## Memory-to-Intelligence Pipeline

```
Operational action completes
    ↓
storeMemory() → operational memory indexed
    ↓
searchMemory(contextKey) → similar past cases retrieved
    ↓
AI agent receives context: "Similar dispute resolved in 38s via full refund"
    ↓
storeRecommendation() → AI suggestion recorded
    ↓
recordAcceptance() + recordOutcome() → feedback loop closed
    ↓
getAcceptanceStats() → learning engine calibrates confidence
```

---

## Tenant Safety

All memory stores are tenant-scoped at the application layer. `searchMemory({ tenantId })` filters strictly to the requesting tenant. Cross-tenant memory access is blocked by the tenant isolation layer before reaching these functions.
