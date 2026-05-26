# VeloCity Enterprise Certification

## Overview

Enterprise certification (`src/lib/certification/`) validates the full platform topology against architecture compliance, runtime health, tenant isolation, and governance standards — producing a scored certification report suitable for enterprise onboarding and compliance audits.

---

## Architecture Validation (`architecture-validator.ts`)

```typescript
validateArchitecture();
// {
//   passed: 5,
//   failed: 0,
//   criticalFailures: [],
//   compliant: true,
// }
```

**Checks performed:**

| Check | Critical | Passes When |
|---|---|---|
| agent-registry-populated | ✅ | AGENT_REGISTRY has > 0 agents |
| governance-reachable | ✅ | getOperatorState() returns a value |
| circuit-breakers-present | ✅ | getAllCircuits().length > 0 |
| hitl-available | ❌ | getPendingApprovals() doesn't throw |
| safety-checks-present | ❌ | checkAllSafety is a function |
| resilience-tested | ❌ | getResilienceReport() returns results |

`compliant` = no critical failures. Non-critical failures reduce the score but don't block certification.

---

## Topology Validation (`topology-validator.ts`)

```typescript
validateTopology();
// {
//   checks: [5 checks],
//   passed: 5,
//   failed: 0,
//   topologyValid: true,
// }
```

**Checks:** ≥ 5 agents registered | compliance validates | deployment not blocked | effectiveness measured | integrations monitored

`topologyValid` = all checks pass.

---

## Tenant Isolation Certification (`isolation-certifier.ts`)

Verifies that tenant isolation boundaries are enforced at the assertion level:

```typescript
certifyTenantIsolation("tenant-abc");
// {
//   assertionsFired: 2,
//   violationsFound: 0,     // cross-tenant attempt correctly blocked
//   certified: true,
// }

runPlatformIsolationCertification(["tenant-abc", "tenant-xyz"]);
// {
//   tenantsChecked: 2,
//   certified: 2,
//   failed: 0,
//   overallCertified: true,
// }
```

Test method: calls `assertTenantIsolation(tenantId, tenantId)` (should pass) and `assertTenantIsolation(tenantId, "DIFFERENT_TENANT_"+tenantId)` (should throw). Failure to throw on cross-tenant access = isolation violation.

---

## Enterprise Certification Report (`enterprise-report.ts`)

Full composite certification score:

```typescript
generateEnterpriseCertification();
// {
//   overallScore: 91,
//   certified: true,
//   certificationLevel: "premium",
//   sections: {
//     architecture: { compliant: true, score: 100 },
//     topology: { valid: true, score: 100 },
//     readiness: { score: 88, level: "premium" },
//     compliance: { compliant: true, score: 100 },
//     resilience: { score: 82 },
//   },
//   criticalIssues: [],
//   recommendations: [],
// }
```

**Score weights:**

| Section | Weight |
|---|---|
| Operational Readiness | 30% |
| Architecture Compliance | 25% |
| Topology Validation | 20% |
| Compliance Rules | 15% |
| Resilience Score | 10% |

**Certification levels:**

| Score | Level | Meaning |
|---|---|---|
| ≥ 95 | Enterprise | Full enterprise deployment approved |
| ≥ 85 | Premium | Production-ready for premium tenants |
| ≥ 70 | Standard | Production-ready, standard tier only |
| < 70 | Uncertified | Not production-ready |

---

## Certification Gate

Recommended pre-production gate:

```
1. validateArchitecture() → must be compliant (no critical failures)
2. validateTopology() → must be topologyValid
3. runPlatformIsolationCertification([...tenantIds]) → overallCertified must be true
4. generateEnterpriseCertification() → certificationLevel must meet required tier
```

For enterprise tenant onboarding, require `certificationLevel === "premium"` or `"enterprise"` before enabling enterprise SLA contracts.

---

## Recertification Schedule

| Event | Required Action |
|---|---|
| New agent added to AGENT_REGISTRY | Re-run architecture validation |
| New tenant tier added | Re-run isolation certification |
| Governance layer modified | Re-run full enterprise certification |
| After incident resolution | Re-run deployment health + resilience checks |
| Weekly scheduled | Full `generateEnterpriseCertification()` |
