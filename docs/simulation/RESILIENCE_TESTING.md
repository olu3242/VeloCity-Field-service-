# VeloCity Resilience Testing

## Overview

The resilience tester (`src/lib/simulation/resilience-tester.ts`) runs logic-only checks against live governance and runtime state — no side effects, no event emission. Results identify structural weaknesses before they become incidents.

---

## Test Suite

```typescript
const report = getResilienceReport();
// {
//   passed: 4,
//   failed: 0,
//   warnings: 2,
//   overallScore: 82,
//   criticalFailures: [],
//   results: [ ... ]
// }
```

### Six Resilience Tests

| Test | Checks | Fail Condition |
|---|---|---|
| `circuit_breaker_saturation` | How many circuits are open | > 3 open → fail |
| `governance_pause_readiness` | Pause/resume control available | Runtime paused without warning → fail |
| `queue_overflow_protection` | Queue depth vs. twin capacity | System load > 90% → fail |
| `ai_fallback_coverage` | Circuit states for AI agents | All AI circuits open → fail |
| `sla_cascade_risk` | SLA breach risk in twin state | slaBreachRisk > 0.8 → fail |
| `dead_letter_accumulation` | DLQ item count | > 50 items → fail, > 20 → warning |

---

## Resilience Score

```
overallScore = (passed × 100 + warnings × 60 + failed × 0) / totalTests
```

**Target:** ≥ 80 for production readiness.

---

## Critical Failures

Critical failures (circuit saturation, AI fallback down) appear in `report.criticalFailures[]` and should immediately trigger:
1. GABRIEL audit
2. Admin notification
3. Escalation to on-call if score < 50

---

## Integration with Self-Healing

Resilience test results feed the self-healing system:

```
getResilienceReport() → criticalFailures[]
    ↓
triggerHealing({ trigger: "circuit_breaker_saturation", ... })
    ↓
resetCircuit() for saturated agents
    ↓
recordHealing() → healing history
```

---

## Running in Production

Resilience tests are safe to run at any frequency — they read governance state and twin snapshots only. Recommended cadence:
- Every 5 minutes via scheduled job
- On-demand via `/api/admin/runtime` GET
- Automatically after any `sla_breach` event
