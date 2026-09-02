# Digital Twin Execution Gate

## Overview

The Digital Twin Execution Gate intercepts high-impact workflow executions and runs a pre-execution simulation against the platform's digital twin model. Based on the simulation's confidence score, the engine decides whether to proceed normally, execute in degraded mode, or abort.

Source: `src/lib/execution/digital-twin.ts`

---

## High-Impact Workflow Registry

The following workflows trigger simulation before execution:

| Workflow ID | Simulation Scenario |
|-------------|---------------------|
| `provider-assignment` | `provider_surge` |
| `bulk-dispatch` | `seasonal_spike` |
| `territory-expansion` | `territory_expansion` |
| `staffing-rebalance` | `provider_surge` |
| `pricing-change` | `pricing_increase` |
| `sla-override` | `sla_degradation` |
| `bulk-cancellation` | `customer_churn` |
| `franchise-configuration` | `revenue_growth_plan` |
| `capacity-planning` | `workforce_expansion` |

Workflows not in this list return `{ simulated: false, confidence: 1.0, recommendation: "proceed" }` immediately.

---

## Simulation Flow

```
evaluateSimulationGate(tenantId, workflow, context, threshold)
        │
        ▼
requiresSimulation(workflow)?
  No  → return proceed (confidence 1.0)
  Yes │
      ▼
  getLatestTwinState()
  null → return degrade (confidence 0.6)
        │
        ▼
  workflowToScenarioParams(workflow)
        │
        ▼
  runSimulation(twinState, params)
        │
        ▼
  scoreSimulationResult(result) → confidence 0–1
        │
        ▼
  deriveRecommendation(confidence, threshold)
        │
        ├── >= threshold         → "proceed"
        ├── >= threshold * 0.7   → "degrade"
        └── < threshold * 0.7   → "abort"
```

---

## Scenario Parameters

```typescript
interface ScenarioParams {
  type: ScenarioType;     // one of the 10 scenario types below
  magnitude: number;      // 0–1, default 0.5
  description: string;    // human-readable label
}
```

Available `ScenarioType` values:
- `territory_expansion`
- `pricing_increase`
- `provider_surge`
- `customer_churn`
- `seasonal_spike`
- `contract_loss`
- `sla_degradation`
- `revenue_growth_plan`
- `supplier_disruption`
- `workforce_expansion`

---

## Confidence Scoring

Raw confidence comes from `SimulationResult.impact.confidence` (0–100 scale, divided by 100).

Adjustments:
- **Revenue loss** (`revenueImpactCents < 0`): multiply by 0.85
- **Queue depth spike** (change > 50% of baseline): multiply by 0.9

Final score is clamped to [0, 1].

---

## SimulationGate Output

```typescript
interface SimulationGate {
  simulated: boolean;
  confidence: number;          // 0–1
  threshold: number;           // from policy (default 0.75)
  passed: boolean;             // confidence >= threshold
  predictedImpact: {
    revenueImpactCents?: number;
    queueDepthChange?: number;
    netImpactCents?: number;
    paybackPeriodDays?: number;
  };
  recommendation: "proceed" | "degrade" | "abort";
  simulatedAt: string;         // ISO 8601
}
```

---

## Engine Integration

The simulation gate is evaluated at Stage 9 of the execution engine:

```typescript
// Stage 9: Digital Twin Simulation
if (!opts.skipSimulation && !intent.skipSimulation && ctx.tenantId) {
  ctx.simulationGate = await evaluateSimulationGate(
    ctx.tenantId,
    ctx.workflow,
    ctx.runtimeState,
    ctx.policyDecision.simulationThreshold,
  )

  if (ctx.simulationGate.recommendation === "abort") {
    // fail immediately with error
  }

  if (ctx.simulationGate.recommendation === "degrade") {
    ctx.status = "degraded"
    // execution continues, but result.status = "degraded"
  }
}

// Stage 11: capture degraded state before overwriting status
let degraded = ctx.status === "degraded" || ctx.simulationGate?.recommendation === "degrade"
ctx.status = "running"
```

The `degraded` flag is captured before `ctx.status` is overwritten to `"running"` so the final result correctly reflects the degraded execution mode.

---

## Failure Handling

If simulation throws (twin state unavailable, service error), the gate returns a conservative degrade:

```typescript
{
  simulated: false,
  confidence: 0.5,
  threshold,
  passed: false,
  predictedImpact: {},
  recommendation: "degrade",
}
```

Simulation failure is always non-fatal. Business operations continue in degraded mode.

---

## Skip Simulation

Simulation can be bypassed when needed:

```typescript
// At intent level
await execute({ ...intent, skipSimulation: true }, fn)

// At engine level
await execute(intent, fn, { skipSimulation: true })
```

Simulation is also skipped when `tenantId` is absent.

---

## Threshold Configuration

The simulation threshold defaults to 0.75 but is configurable via the policy decision:

```typescript
// In ExecutionIntent
intent.simulationThreshold = 0.85  // stricter gate for critical operations

// In policy evaluation
policyDecision.simulationThreshold = intent.simulationThreshold ?? 0.75
```

Recommendations are derived against this threshold:
- `confidence >= threshold` → proceed
- `confidence >= threshold * 0.7` → degrade
- `confidence < threshold * 0.7` → abort
