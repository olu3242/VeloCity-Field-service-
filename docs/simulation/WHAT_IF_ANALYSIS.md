# VeloCity What-If Analysis

## Overview

The simulation engine (`src/lib/simulation/engine.ts`) runs pure-mathematical scenario projections. No DB writes, no event emissions — results exist only in memory.

---

## Running a Simulation

```typescript
const result = runSimulation({
  scenario: "queue_saturation",
  baselineState: captureState(...),
  parameters: {
    queueDepth: 200,
    activeWorkers: 2,
    failureRate: 0.15,
    avgProcessingMs: 3500,
    aiCallsPerMinute: 25,
    pendingEscalations: 8,
  },
  durationMs: 300_000,  // 5-minute projection
});
// {
//   scenario: "queue_saturation",
//   verdict: "degraded",
//   projectedEventsProcessed: 214,
//   projectedFailures: 32,
//   projectedQueueDepth: 186,
//   projectedSlaBreaches: 4,
//   projectedCostUsd: 3.55,
//   projectedDurationMs: 300_000,
//   recommendations: ["Scale workers immediately", "Enable queue throttling"],
// }
```

---

## Scenarios

| Scenario | Models |
|---|---|
| `queue_saturation` | Queue overflow, SLA breach risk |
| `worker_failure` | Degraded worker capacity |
| `ai_outage` | No AI calls available, fallback-only |
| `payment_spike` | Burst of payment events |
| `dispute_storm` | Dispute volume surge |
| `sla_breach_cascade` | Escalating SLA violations |
| `normal_operations` | Baseline health projection |

---

## Verdict Logic

| Condition | Verdict |
|---|---|
| Failure rate > 30% OR queue depth > 80% capacity | `collapsed` |
| Failure rate > 15% OR SLA breaches > 5 | `degraded` |
| Otherwise | `stable` |

---

## What-If Analysis

```typescript
const analysis = runWhatIfAnalysis(
  baselineState,
  [
    { workers: 2, name: "current" },
    { workers: 4, name: "double workers" },
    { workers: 6, name: "triple workers" },
  ],
  "queue_saturation",
  300_000,
);
// Returns SimulationResult[] with verdict for each variation
// Enables capacity planning: "4 workers → stable; 2 workers → collapsed"
```

---

## Use Cases

- **Capacity planning:** How many workers needed for 2× event volume?
- **Incident simulation:** What happens if 2 of 4 workers fail?
- **Cost projection:** What does a payment spike cost in AI calls?
- **SLA risk assessment:** At what queue depth do SLA breaches cascade?
- **Scenario rehearsal:** Pre-test responses to known failure modes
