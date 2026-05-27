# VeloCity Compliance Automation

## Overview

The compliance automation layer (`src/lib/compliance/`) executes governance policies on a schedule, enforces data retention rules, raises critical compliance alerts (with GABRIEL escalation), and audits trail completeness.

---

## Policy Executor (`policy-executor.ts`)

```typescript
executePolicy("ret-001");
// { policyId: "ret-001", passed: true, findings: [], executedAt }

executeAllPolicies();
// executes all enabled policies, returns results array

getLatestResult("aud-001");
getPolicyViolations();
// all results where passed = false
```

**Pre-registered policies:**

| ID | Name | Type | Severity | Interval |
|---|---|---|---|---|
| ret-001 | Audit Log Retention | retention | critical | 24h |
| aud-001 | Audit Trail Completeness | audit_completeness | warning | 1h |
| acc-001 | Access Control Verification | access_control | critical | 1h |

Policy `acc-001` fails if runtime is paused. Policy `aud-001` fails if operator state is unavailable.

---

## Retention Enforcer (`retention-enforcer.ts`)

```typescript
enforceRetention("tenant-abc", "audit_logs", 365);
// purges records older than 365 days, returns { purgedCount, tenantId, dataCategory }

getRetentionStatus("tenant-abc");
// { categories: [{ dataCategory, retentionDays, lastEnforcedAt, status }] }
```

---

## Compliance Alert (`compliance-alert.ts`)

```typescript
await createAlert({
  alertType: "violation",
  policyId: "acc-001",
  tenantId: "tenant-abc",
  detail: "Access control check failed — runtime paused",
  severity: "critical",
});
// if severity = "critical", emits "agent_run" → GABRIEL via dynamic import

acknowledgeAlert(alertId);

getUnacknowledgedAlerts("critical");
// all unacknowledged critical alerts

getAlertStats();
// { total: 23, unacknowledged: 5, bySeverity: { critical: 3, warning: 12, info: 8 } }
```

**Cap:** 500 alerts. Critical alerts trigger GABRIEL governance audit automatically.

---

## Audit Completeness Checker (`audit-checker.ts`)

```typescript
checkAuditCompleteness("tenant-abc");
// {
//   tenantId: "tenant-abc",
//   coveragePct: 94,
//   missingCategories: ["provider_actions"],
//   checkedAt: "...",
// }

getRecentChecks(20);        // last 20 completeness checks
getAverageCoverage();       // average coverage % across all checks
```

**Cap:** 100 checks.
