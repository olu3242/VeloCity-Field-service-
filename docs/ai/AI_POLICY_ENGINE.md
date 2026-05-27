# VeloCity AI Policy Engine

## Overview

The AI policy engine (`src/lib/ai-policy/`) enforces governance rules on every AI agent action — ensuring restricted operations require approval, policy violations are tracked, and confidence thresholds gate execution quality.

---

## Execution Rules (`execution-rules.ts`)

Priority-ordered rules evaluated before every AI dispatch:

```typescript
getEffectiveAction("FINN", "payout_released", { amount: 75000 });
// evaluates rules in priority order:
// 1. "no-dispatch-paused" (priority 100): if isRuntimePaused → "deny"
// 2. "no-payout-without-approval" (priority 90): FINN + payout → "require_approval"
// 3. "gabriel-anomaly-log" (priority 10): GABRIEL calls → "log_only"
// 4. "allow-standard" (priority 0): default → "allow"
// returns: "require_approval" (highest-priority match)
```

**Pre-registered rules:**

| Rule | Agent | Event | Action | Priority |
|---|---|---|---|---|
| Block dispatch when paused | All | All | deny | 100 |
| Payout requires approval | FINN | payout_released | require_approval | 90 |
| Log GABRIEL anomaly calls | GABRIEL | All | log_only | 10 |
| Allow standard execution | All | All | allow | 0 |

`evaluateRules()` returns all matching rule evaluations — useful for audit logging.

---

## Restricted Actions (`restricted-actions.ts`)

Hard caps on high-risk AI operations:

```typescript
checkActionAllowed("payout-large", { valueUsd: 75_000 });
// { allowed: false, reason: "Human approval required" }

checkActionAllowed("payout-large", { valueUsd: 30_000 });
// { allowed: false, reason: "Human approval required" }
// (requiresHumanApproval=true always blocks regardless of amount)

recordExecution("payout-large");  // updates lastExecutedAt for cooldown

getAllRestrictedActions();
```

**Pre-registered restricted actions:**

| Action | Agent | Cap | Requires Approval | Cooldown |
|---|---|---|---|---|
| payout-large | FINN | $50k | ✅ | 5 min |
| dispute-bulk-resolve | IVY | — | ✅ | 10 min |
| agent-suspend | MAX | — | ✅ | 60 min |

---

## Approval Policies (`approval-policies.ts`)

```typescript
const pending = requestApproval(
  "large-payout-approval",
  "FINN",
  "payout_released",
  { jobId: "job-123", amount: 75000 },
  "tenant-abc"
);
// expires in 5 minutes, notifies via pager

resolveApproval(pending.id, "approved", "admin-user-1");

expireStaleApprovals();  // batch expire timed-out approvals using defaultOnTimeout
getPendingApprovals("FINN");  // pending approvals for FINN
```

**Default policies:** Large payout (5min timeout, deny on expiry) | Bulk action (10min timeout, deny on expiry)

---

## Violation Tracking (`violation-tracker.ts`)

```typescript
recordViolation({
  ruleId: "no-dispatch-paused",
  ruleName: "Block dispatch when runtime paused",
  agentName: "IVY",
  eventType: "dispute_opened",
  violationType: "denied",
  detail: "Dispatch attempted while runtime paused",
});

getViolationSummary();
// {
//   total: 7, unresolved: 5,
//   byType: { denied: 4, rate_exceeded: 3 },
//   byAgent: { IVY: 3, FINN: 2, GABRIEL: 2 }
// }
```

---

## Policy Enforcement Pipeline

```
dispatchAgent("FINN", prompt, context)
    ↓
getEffectiveAction("FINN", "payout_released", context)
    │
    ├── "deny" → recordViolation + abort
    ├── "require_approval" → requestApproval() + halt pending
    ├── "log_only" → log and proceed
    └── "allow" → proceed
    ↓
checkActionAllowed("payout-large", context)
    │
    └── not allowed → recordViolation + abort
    ↓
evaluateConfidence("FINN", domain, confidence)
    │
    └── "reject" → abort with hallucination guard
    ↓
Execute AI call
```

All AI actions pass governance checks before execution. No bypass path exists.
