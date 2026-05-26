# VeloCity AI Quality Control

## Overview

The AI quality control layer (`src/lib/ai-quality/`) ensures AI agent outputs meet reliability and accuracy standards — through recommendation scoring, hallucination safeguards, confidence thresholds, and operator override tracking.

---

## Recommendation Scoring (`recommendation-scorer.ts`)

Calibrates AI recommendations against historical accuracy:

```typescript
const quality = scoreRecommendation(
  "rec-123",
  "IVY",
  "dispute-resolution",
  0.88,   // IVY's stated confidence
);
// {
//   calibrationScore: 0.91,    // IVY's historical accuracy on disputes
//   finalScore: 0.88×0.4 + 0.91×0.6 = 0.898
//   approved: true,            // 0.898 >= 0.65 threshold
// }

// After outcome is known, update calibration:
updateCalibration("IVY", "dispute-resolution", 1.0);  // correct recommendation
// new calibration = 0.91×0.7 + 1.0×0.3 = 0.937 (rolling weighted update)
```

**Formula:** `finalScore = confidence × 0.4 + calibration × 0.6`

Default threshold: 0.65. Adjustable via `setThreshold()`.

---

## Hallucination Safeguards (`hallucination-guard.ts`)

```typescript
const check = checkForHallucination("IVY", {
  action: "refund",
  amount: 15000,
  confidence: 0.85
}, 0.85);
// checks: [
//   { rule: "confidence_in_range", passed: true },
//   { rule: "not_excessive_confidence", passed: true },
//   { rule: "output_not_empty", passed: true },
//   { rule: "no_contradictory_keys", passed: true },
// ]
// flagged: false

getHallucinationRate("IVY");   // 0.02 (2% of IVY calls flagged)
getFlaggedChecks("IVY");        // all flagged outputs for review
```

**Rules checked:**
1. `confidence_in_range` — confidence in [0, 1]
2. `not_excessive_confidence` — confidence ≤ 0.99 (100% confidence = hallucination signal)
3. `output_not_empty` — output has at least one key
4. `no_contradictory_keys` — output doesn't have both "yes" and "no"

---

## Confidence Thresholds (`confidence-threshold.ts`)

Per-agent, per-domain confidence requirements:

```typescript
evaluateConfidence("IVY", "dispute-resolution", 0.92);
// "approve"  (>= warn 0.80, < autoApprove 0.95)

evaluateConfidence("IVY", "dispute-resolution", 0.97);
// "auto_approve"  (>= autoApprove 0.95)

evaluateConfidence("IVY", "dispute-resolution", 0.65);
// "reject"  (< min 0.70)
```

**Default thresholds:**

| Agent | Domain | Min | Warn | Auto-Approve |
|---|---|---|---|---|
| IVY | dispute-resolution | 0.70 | 0.80 | 0.95 |
| FINN | payment-recovery | 0.75 | 0.85 | 0.95 |
| GABRIEL | anomaly-detection | 0.60 | 0.70 | 0.90 |
| (default) | any | 0.60 | 0.75 | 0.92 |

`"reject"` decisions should halt AI dispatch and route to human review.

---

## Override Tracking (`override-tracker.ts`)

```typescript
recordOverride({
  agentName: "IVY",
  domain: "dispute-resolution",
  originalRecommendation: "Issue partial refund (60%)",
  overriddenBy: "admin-user-1",
  overrideReason: "Customer provided conclusive evidence",
  overrideAction: "Full refund issued",
  tenantId: "tenant-abc",
});

getTopOverriddenAgents();
// [ { agentName: "FINN", overrideCount: 12 }, { agentName: "IVY", overrideCount: 7 } ]

getOverrideRate("IVY", "dispute-resolution");
// normalized 0-1 (count / 100 cap)
```

High override rates for a specific agent+domain trigger:
1. `updateCalibration()` with lower accuracy score
2. Learning engine signal to add human gate to that workflow

---

## Quality Control Pipeline

```
dispatchAgent("IVY", prompt, context)
    ↓
evaluateConfidence("IVY", domain, confidence)
    │
    ├── "auto_approve" → proceed directly
    ├── "approve" → proceed with logging
    ├── "warn" → flag for review, proceed
    └── "reject" → halt, route to human
    ↓
checkForHallucination("IVY", output, confidence)
    │
    └── flagged=true → halt, log, alert
    ↓
scoreRecommendation(id, "IVY", domain, confidence)
    │
    └── approved=false → route to human review
    ↓
Output delivered → recordAcceptance() → recordOutcome()
    ↓
updateCalibration("IVY", domain, accuracy)
```
