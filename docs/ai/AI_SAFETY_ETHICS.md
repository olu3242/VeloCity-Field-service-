# VeloCity AI Safety + Ethics

## Overview

The AI safety layer (`src/lib/ai-safety/`) detects and blocks unsafe agent executions, enforces pre-registered ethics policies on every agent action, and monitors for bias signals across protected dimensions — keeping AI governance-constrained at all times.

---

## Unsafe Execution Detector (`unsafe-detector.ts`)

```typescript
detectUnsafeExecution("FINN", "payout_released", {
  confidence: 0.15,
  attemptedAction: "force_approve",
  tenantId: "tenant-abc",
});
// {
//   reason: "confidence below 0.2 — execution blocked; attempted action 'force_approve' violates governance",
//   blocked: true,
// }

detectUnsafeExecution("IVY", "dispute_opened", { confidence: 0.25 });
// { reason: "low confidence 0.25 (hallucination risk)", blocked: false }

detectUnsafeExecution("IVY", "dispute_opened", { confidence: 0.85 });
// null — no unsafe signals

getUnsafeLog("FINN");       // FINN's unsafe executions
getBlockedExecutions();     // all executions where blocked = true
```

**Block triggers:** confidence < 0.2 OR action contains `bulk_delete` | `force_approve` | `override_governance`

**Flag triggers (not blocked):** confidence 0.2–0.3

**Cap:** 200 entries.

---

## Ethics Policies (`ethics-policies.ts`)

```typescript
evaluateEthics("FINN", "bulk_payout_release", "financial");
// { allowed: false, policy: { policyId: "no-bulk-financial-override" }, reason: "Blocked by policy..." }

evaluateEthics("IVY", "auto_resolve", "dispute");
// { allowed: true, policy: { policyId: "dispute-fairness" }, reason: "Policy triggered for agent IVY..." }

getActivePolicies();
registerPolicy({ policyId: "custom-rule", scope: "all", action: "require_human", ... });
```

**Pre-registered policies:**

| ID | Scope | Action | Rule |
|---|---|---|---|
| no-bulk-financial-override | financial | block | No bulk financial actions without approval |
| dispute-fairness | dispute | warn | Flag low-confidence dispute decisions |
| no-silent-data-deletion | all | block | Data deletion requires audit trail |

First matching `block` policy prevents execution. `warn` / `require_human` policies allow execution but flag it.

---

## Bias Monitor (`bias-monitor.ts`)

```typescript
recordBiasSignal("IVY", "provider_tier", "Premium providers resolved 30% faster than standard", "medium");

getBiasReport("IVY");
// {
//   totalSignals: 7,
//   byDimension: { provider_tier: 3, dispute_value: 2, tenant_size: 2 },
//   bySeverity: { medium: 5, high: 2 },
// }

getHighSeveritySignals();
// all BiasSignals where severity = "high"
```

**Monitored dimensions:** `tenant_size` | `provider_tier` | `geography` | `dispute_value`

**Cap:** 200 signals.
