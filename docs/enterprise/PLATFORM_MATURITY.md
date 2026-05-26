# VeloCity Platform Maturity

## Overview

The maturity layer (`src/lib/maturity/`) provides deployment health validation, enterprise compliance checking, and operational readiness scoring — gating production deployments and certifying the platform for enterprise use.

---

## Deployment Health Check (`deployment-health.ts`)

Run before any production deployment:

```typescript
const report = runDeploymentHealthCheck();
// {
//   overallStatus: "ready",     // "ready" | "degraded" | "blocked"
//   score: 96,
//   checks: [ ... ],
//   blockers: [],
//   warnings: [],
// }
```

**Checks performed:**

| Check | Pass Condition | Fail Severity |
|---|---|---|
| governance_active | Runtime not paused | critical |
| circuit_breakers | ≤ 3 circuits open | warning/critical |
| pending_approvals | 0 HITL approvals pending | warning |
| resilience_score | Resilience score ≥ 70 | critical |
| quota_headroom | Default quotas configured | info |

**Status logic:**
- Any critical failure → `"blocked"` (deployment should not proceed)
- Score < 80 → `"degraded"` (deploy with caution)
- Otherwise → `"ready"`

---

## Compliance Validation (`compliance-validator.ts`)

Enterprise compliance against 8 rules:

```typescript
const report = runComplianceValidation();
// {
//   overallCompliant: true,
//   score: 100,         // % of required rules passing
//   criticalViolations: [],
// }
```

**Required rules (must all pass for compliance):**

| Rule | Category |
|---|---|
| Tenant isolation boundaries | data_isolation |
| Audit trail active | audit_trail |
| Circuit breakers active | operational_readiness |
| HITL workflow support | sla_governance |
| Governance pause/resume | access_control |
| Execution quotas defined | operational_readiness |

**Recommended rules (scored but not blocking):**

| Rule | Category |
|---|---|
| Dead letter queue monitored | sla_governance |
| Resilience score ≥ 80 | operational_readiness |

---

## Operational Readiness Score (`readiness-scorer.ts`)

Composite certification scoring:

```typescript
const readiness = scoreOperationalReadiness();
// {
//   composite: 88,
//   certified: true,
//   certificationLevel: "premium",
//   dimensions: [
//     { dimension: "Governance", score: 100, weight: 0.25 },
//     { dimension: "Observability", score: 91, weight: 0.20 },
//     { dimension: "Resilience", score: 82, weight: 0.20 },
//     { dimension: "Integration Health", score: 90, weight: 0.15 },
//     { dimension: "Compliance", score: 100, weight: 0.20 },
//   ]
// }
```

**Certification levels:**

| Composite | Level | Meaning |
|---|---|---|
| ≥ 95 | Enterprise | Full enterprise deployment certified |
| ≥ 85 | Premium | Production-ready for premium tenants |
| ≥ 70 | Standard | Production-ready for standard operations |
| < 70 | Uncertified | Not ready for production |

---

## Maturity Gate Pattern

Recommended deployment gate:

```
1. runDeploymentHealthCheck()
   → if "blocked": halt deployment
   → if "degraded": require manual approval

2. runComplianceValidation()
   → if !overallCompliant: halt deployment
   → log criticalViolations to audit trail

3. scoreOperationalReadiness()
   → certificationLevel determines which tenant tiers can be served
   → "uncertified": serve no production traffic
   → "standard": serve standard tenants only
   → "premium"/"enterprise": full tenant tier access
```

---

## Production Certification Checklist

- [ ] `runDeploymentHealthCheck().overallStatus === "ready"`
- [ ] `runComplianceValidation().overallCompliant === true`
- [ ] `scoreOperationalReadiness().certificationLevel` meets required tier
- [ ] Resilience score ≥ 80
- [ ] No pending HITL approvals blocking deployment
- [ ] All circuit breakers in closed state
- [ ] Dead letter queue at 0 items
