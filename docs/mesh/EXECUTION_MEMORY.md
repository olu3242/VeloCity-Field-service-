# VeloCity Execution Memory System

## What Is Execution Memory?

Execution memory (`src/lib/mesh/execution-memory.ts`) is VeloCity's institutional knowledge base — a growing store of resolved situations, successful interventions, and operational lessons that the platform can reference when facing similar challenges.

> "The platform remembers how it solved this before."

---

## Memory Structure

```typescript
recordMemory({
  type: "resolution",
  domain: "dispute",
  summary: "No-show HVAC dispute: full refund + REX trust penalty −15",
  detail: {
    reason: "provider_no_show",
    resolution: "full_refund",
    trustDelta: -15,
    evidence: "customer_photo + gps_gap",
    ivy_confidence: 0.95,
  },
  outcome: "successful",
  confidence: 0.95,
});
```

### Memory Types

| Type | Use Case |
|---|---|
| `intervention` | How a critical situation was handled |
| `failure` | What went wrong and what was tried |
| `recovery` | How a failure was recovered from |
| `optimization` | Workflow/routing improvement that worked |
| `resolution` | How a dispute/escalation was resolved |
| `pattern` | Recognized recurring operational pattern |

---

## Recalling Memory

```typescript
// Before IVY analyzes a new dispute:
const priorResolutions = recallMemory("dispute", "resolution", 0.8);
// Returns: high-confidence prior resolutions, sorted by confidence
// Each recall increments timesReferenced — frequently used memories gain visibility
```

`findSimilarResolutions(domain, outcome)` finds memories with matching domain and outcome type — useful for "show me cases where the payout was successfully held".

---

## Memory Confidence

Confidence (0-1) represents how reliable this memory is:

| Confidence | Meaning |
|---|---|
| ≥ 0.9 | High-confidence, well-documented resolution |
| 0.7-0.9 | Solid evidence, generally applicable |
| 0.5-0.7 | Moderate — context-dependent |
| < 0.5 | Low confidence — context very specific |

`recallMemory()` defaults to `minConfidence = 0.5` — only returns actionable memories.

---

## Memory Summary

```typescript
getMemorySummary();
// {
//   total: 247,
//   byDomain: { dispute: 89, payout: 54, provider: 62, workflow: 42 },
//   avgConfidence: 0.81,
//   topMemories: [  // top 3 by timesReferenced
//     { summary: "No-show HVAC: full refund", timesReferenced: 34, ... },
//     { summary: "Payout hold: fraud signal", timesReferenced: 28, ... },
//   ]
// }
```

The top memories by reference count represent the platform's most-relied-upon operational knowledge.

---

## Integration Roadmap

### Current State
- In-memory storage (resets on restart)
- Available for programmatic recall during handler execution

### Phase 2 — Persistent Memory
- Persist to `execution_memories` Supabase table
- Memory survives restarts and scales across workers
- `recallMemory()` queries DB with filters

### Phase 3 — Agent-Integrated Memory
- `hydrateContext()` automatically calls `recallMemory(domain)` for the agent's domain
- Top 3 memories included in agent system prompt as reference context
- Enables AI recommendations to improve with each resolved case

### Phase 4 — Memory Learning Loop
- Outcomes feed back into memory confidence scores
- Memories with negative outcomes downweighted automatically
- New patterns surface as high-confidence memories after N confirmations

---

## Privacy and Tenant Safety

All memory records are domain-tagged. Memories from one tenant's operations should NOT inform another tenant's AI decisions.

**Current state:** Memories are not tenant-tagged (shared pool).
**Roadmap:** Add `tenantId?: string` to `ExecutionMemory` — null = platform-wide knowledge, string = tenant-specific. `recallMemory()` will filter to tenant + null (shared).
