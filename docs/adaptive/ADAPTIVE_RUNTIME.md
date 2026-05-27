# VeloCity Adaptive Runtime

## Overview

The adaptive runtime (`src/lib/adaptive/`) enables VeloCity to tune its own operational parameters based on observed execution patterns — under strict governance controls and with full rollback capability.

---

## Architecture

```
Runtime execution patterns
    ↓
recordPattern() → PATTERNS store
    ↓
generateTuningSignals() → TuningSignal[]
    ↓
proposeAdaptation() → AdaptationProposal
    ↓
[low risk: auto-approve] [medium/high: human approval required]
    ↓
applyTuning(field, value, reason)
    ↓
TUNING_CONFIG (live runtime parameters)
```

---

## Runtime Learner (`runtime-learner.ts`)

Patterns are recorded at key execution boundaries:

```typescript
recordPattern({
  patternType: "high_failure_rate",
  context: "dispute-resolution workflow",
  observedValue: 0.15,
  expectedValue: 0.02,
  confidence: 0.85,
  suggestedAction: "increase_timeout",
});
```

**Pattern types:** `high_failure_rate`, `slow_execution`, `queue_saturation`, `cost_spike`, `low_ai_confidence`, `retry_storm`

Signal generation applies thresholds:
- Failure rate > 10% → `increase_timeout` (confidence 0.7)
- Slow execution > 3× expected → `increase_timeout` (confidence 0.75)
- Queue saturation > 80% → `scale_workers` (confidence 0.8)

---

## Self-Tuner (`self-tuner.ts`)

Bounded runtime parameter management:

```typescript
export const DEFAULT_TUNING: TuningConfig = {
  retryBaseDelayMs: 60_000,
  escalationThresholdMs: 3_600_000,
  queuePriorityBoostFactor: 1.0,
  notificationBatchWindowMs: 30_000,
  maxConcurrentAICalls: 10,
};
```

**Tuning bounds (enforced hard limits):**

| Parameter | Min | Max |
|---|---|---|
| retryBaseDelayMs | 5,000 | 3,600,000 |
| escalationThresholdMs | 60,000 | 86,400,000 |
| queuePriorityBoostFactor | 0.1 | 5.0 |
| notificationBatchWindowMs | 1,000 | 300,000 |
| maxConcurrentAICalls | 1 | 50 |

Changes are blocked when `isRuntimePaused() === true`.

Full change history is retained: `explainCurrentConfig()` shows each field's current value, default value, and `lastChangedAt`.

---

## Safe Adaptation (`safe-adaptation.ts`)

All tuning changes go through the proposal system:

```typescript
const proposal = proposeAdaptation({
  field: "retryBaseDelayMs",
  currentValue: 60_000,
  proposedValue: 120_000,
  rationale: "High retry storm pattern detected — increasing delay",
  riskLevel: "low",      // auto-approved
  source: "runtime-learner",
});
```

**Risk levels:**
- `low` → auto-approved immediately
- `medium` → requires admin approval via `/api/admin/runtime`
- `high` → requires admin approval + audit log

Rollback restores the previous value and records the rollback in proposal history.

---

## Governance Integration

The adaptive runtime is subordinate to the governance layer:
- `isRuntimePaused()` blocks all tuning changes
- High-risk proposals require human approval before `applyTuning()` is called
- All changes logged with `reason`, `source`, and `timestamp`
- `getRollbackCapability()` shows which signals are revertible
