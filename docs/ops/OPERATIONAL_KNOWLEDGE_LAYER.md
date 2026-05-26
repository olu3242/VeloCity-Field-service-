# VeloCity Operational Knowledge Layer

## What Is It?

The operational knowledge layer is VeloCity's institutional memory system — a persistent store of learned patterns, historical resolutions, and operational wisdom that improves platform intelligence over time.

Unlike the database (which records facts), the knowledge layer records **insights and patterns** derived from operational data.

---

## Three Knowledge Systems

### 1. Operational Patterns (`ops-graph/knowledge.ts`)
Pattern detection across operational events.

```typescript
import { recordPattern, findSimilarPatterns } from "@/lib/ops-graph/knowledge";

// Record a detected pattern
recordPattern({
  type: "escalation_pattern",
  description: "HVAC jobs in zip 90210 have 3× average dispute rate",
  confidence: 0.78,
  occurrences: 7,
  data: { zip: "90210", category: "hvac", dispute_rate: 0.21 },
});

// Retrieve patterns for decision support
const riskPatterns = findSimilarPatterns("risk_correlation", 0.7);
```

Pattern types:
- `anomaly` — detected operational anomalies
- `workflow_optimization` — identified bottlenecks or improvement opportunities
- `escalation_pattern` — recurring escalation triggers
- `seasonal` — time-based demand/supply patterns
- `risk_correlation` — correlated risk signals

### 2. Execution Memory (`mesh/execution-memory.ts`)
Historical resolution and recovery records.

```typescript
import { recordMemory, recallMemory } from "@/lib/mesh/execution-memory";

// Record how a past situation was resolved
recordMemory({
  type: "resolution",
  domain: "dispute",
  summary: "HVAC no-show resolved with 100% refund + REX trust penalty",
  detail: { reason: "no_show", resolution: "full_refund", trustDelta: -15 },
  outcome: "successful",
  confidence: 0.95,
});

// Recall similar resolutions for current decision
const priorResolutions = recallMemory("dispute", "resolution", 0.8);
```

Memory types: `intervention | failure | recovery | optimization | resolution | pattern`

`recallMemory()` increments `timesReferenced` — frequently recalled memories gain visibility in the `getMemorySummary()` report.

### 3. Learning Signals (`intelligence/learning-engine.ts`)
Workflow outcome analysis producing improvement signals.

```typescript
import { recordOutcome, analyzeWorkflow } from "@/lib/intelligence/learning-engine";

recordOutcome({
  workflowId: "dispute-resolution-v1",
  outcomeType: "dispute_resolved",
  durationMs: 72_000,
  stepsCompleted: 7,
  stepsFailed: 1,
  humanInterventions: 1,
  aiDecisions: 2,
  finalStatus: "success",
  metadata: {},
});

const signals = analyzeWorkflow("dispute-resolution-v1");
// signals: [{ signal: "add_human_gate", confidence: 0.8, recommendation: "..." }]
```

---

## Knowledge Flow

```
Operational event occurs
        ↓
Handler processes (alice-intake, ivy-dispute, etc.)
        ↓
Outcome recorded → recordOutcome()
        ↓
Pattern detected → recordPattern()
        ↓
Resolution stored → recordMemory()
        ↓
Learning signals generated → analyzeWorkflow()
        ↓
Signals fed back to:
  • Agent context hydration (hydrateContext)
  • Decision optimization (optimizeDecision)
  • Admin command center recommendations
```

---

## Knowledge in Agent Context

When `hydrateContext("IVY", { jobId, tenantId })` runs, it can pull from execution memory to enrich the agent's understanding of similar past disputes, improving recommendation accuracy.

Planned integration (Wave 6): Context hydration explicitly calls `recallMemory(domain, "resolution")` and includes top resolutions in the agent prompt.

---

## Knowledge Persistence

**Current state:** All knowledge is in-memory (resets on restart).

**Roadmap:**
- P1: Persist `OperationalPattern` to `operational_patterns` Supabase table
- P1: Persist `ExecutionMemory` to `execution_memories` Supabase table
- P2: Expose knowledge API for admin inspection (`GET /api/admin/knowledge`)
- P3: Feed knowledge into agent system prompts for continuous improvement

---

## Privacy and Tenant Safety

All knowledge records are tagged with `domain` and can be filtered by `tenantId`. Cross-tenant knowledge sharing is prohibited by default. Only platform-wide aggregate patterns (no PII, no entity IDs) are shared across tenants.
