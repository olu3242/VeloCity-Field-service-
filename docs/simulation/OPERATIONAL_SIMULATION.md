# VeloCity Operational Simulation

## Overview

The simulation subsystem (`src/lib/simulation/`) provides three complementary capabilities: real-time state modeling (digital twin), mathematical scenario projection (engine), and structural resilience validation (tester). Together they enable proactive operations at scale.

---

## Simulation Stack

```
Live platform state
    ↓
captureState() → TwinState (in-memory, no production side effects)
    ↓
┌─────────────────────────────────────────┐
│ runSimulation(scenario, state, params)  │  ← pure math, no DB
│ runWhatIfAnalysis(state, variations)    │
└─────────────────────────────────────────┘
    ↓
SimulationResult { verdict, recommendations }
    ↓
┌─────────────────────────────────────────┐
│ getResilienceReport()                   │  ← reads governance state
└─────────────────────────────────────────┘
    ↓
ResilienceReport { score, criticalFailures }
```

---

## Operational Use Cases

### Incident Pre-Emption

Run `queue_saturation` simulation before peak hours:
- If projected verdict is `degraded`: scale workers preemptively
- If projected SLA breaches > 5: notify operations team

### Post-Incident Analysis

After an incident, replay conditions through simulation:
- Set parameters to match observed values at incident time
- Compare `projected` vs `actual` to validate simulation accuracy

### Capacity Planning

`runWhatIfAnalysis()` with varying worker counts identifies optimal capacity:

```
2 workers → collapsed (queue depth 186)
4 workers → stable (queue depth 42)
6 workers → stable (queue depth 8, cost +40%)
```
Decision: provision 4 workers, autoscale to 6 at queue depth > 100.

### Resilience Scorecard

Weekly resilience report:
- `overallScore` trend over 4 weeks
- `criticalFailures` history
- Improvement tracking after fixes

---

## Isolation Guarantees

The simulation layer is **strictly isolated** from production:

- No Supabase reads or writes during simulation
- No `emitEvent()` calls from simulation engine
- No governance state mutations
- Twin state is additive-only (never removes production state)

This enables simulation to run in CI pipelines, staging environments, or concurrently with production without risk.
