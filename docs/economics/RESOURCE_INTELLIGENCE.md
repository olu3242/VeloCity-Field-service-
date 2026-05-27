# VeloCity Resource Intelligence

## Overview

Resource intelligence bridges raw execution telemetry with financial decision-making — enabling per-tenant cost visibility, budget governance, and ROI reporting at the platform level.

---

## Cost Model

| Resource | Rate |
|---|---|
| AI token (blended) | $0.000009/token |
| Manual event handling (avoided) | $8.75 (0.25h × $35/hr) |
| Dispute operations (estimated) | $70/dispute |
| Escalated dispute multiplier | 2.5× |

---

## Per-Tenant Budget Governance

```typescript
// Check before dispatching AI call:
const check = checkBudget(tenantId, estimatedTokens);
if (!check.allowed) {
  // Throttle or queue for next window
}

// Record after execution:
recordExecution("IVY", tenantId, tokensUsed, latencyMs);
```

Budget windows reset every 24 hours. Hourly call limits reset every 60 minutes.

---

## ROI-to-Cost Ratio

The economics layer connects telemetry snapshots to ROI:

```
Telemetry snapshot (eventsProcessed, aiCostUsd)
    ↓
calculateROI({ eventsAuto, eventsTotal, aiCostUsd, periodLabel })
    ↓
AutomationROIMetrics { netROIUsd, roiMultiplier, automationRate }
    ↓
buildExecutiveMetrics(snapshot, roi) → board-level summary
```

A healthy platform maintains a ROI multiplier > 100× (labor avoided vs. AI cost).

---

## Optimization Signals

Generated automatically when thresholds are crossed:

| Condition | Recommendation |
|---|---|
| IVY cost > 40% of total | Increase auto-resolution threshold |
| Avg tokens/call > 3000 | Review agent prompts for verbosity |
| Fallback rate > 20% | AI unavailable — check Anthropic API status |
| ROI multiplier < 10× | Review automation scope |
| Dispute cost > 20% of total ops cost | Prioritize dispute prevention |

---

## Provider Network Health

`scoreProviderNetworkHealth(metrics)` evaluates:

- Average provider rating (30% weight)
- Retention rate (40% weight)  
- Job completion rate (30% weight)

Scores map to health grades:

| Score | Grade | Action |
|---|---|---|
| ≥ 90 | Excellent | Monitor |
| ≥ 75 | Good | Optimize |
| ≥ 60 | Fair | Investigate |
| < 60 | Poor | Immediate intervention |
