# VeloCity Security + Trust Layer

## Overview

The security layer (`src/lib/security/`) provides runtime anomaly detection, fraud escalation triggers, privilege boundary auditing, and tenant isolation validation — ensuring the platform maintains trust and safety at enterprise scale.

---

## Runtime Anomaly Scoring (`anomaly-scorer.ts`)

```typescript
const anomaly = scoreAnomaly(
  "cross_tenant_access_attempt",
  { requestTenantId: "tenant-a", resourceTenantId: "tenant-b", endpoint: "/api/jobs" },
  "tenant-a"
);
// { id, score: 95, signalType: "cross_tenant_access_attempt", resolved: false }

getAnomalyScore("tenant-a");  // sum of active anomaly scores, capped at 100
getActiveAnomalies("tenant-a");
resolveAnomaly(anomaly.id);
```

**Base scores by signal type:**

| Signal | Score | Severity |
|---|---|---|
| cross_tenant_access_attempt | 95 | Critical |
| rapid_event_burst | 70 | High |
| abnormal_ai_usage | 65 | High |
| repeated_auth_failure | 60 | Medium |
| unusual_event_sequence | 55 | Medium |
| payload_size_anomaly | 45 | Low |
| execution_time_anomaly | 40 | Low |

---

## Fraud Escalation (`fraud-escalation.ts`)

```typescript
// Trigger fraud detection (async — may emit events):
const alert = await triggerFraudAlert("tenant-abc", "chargebacks_threshold", {
  chargebackCount: 8,
  windowDays: 30,
});
// riskScore: 85 → automatically emits "agent_run" to GABRIEL

// Manual escalation to SLA system:
await escalateFraudAlert(alert.id);
// Emits "sla_escalate" event

getFraudRiskScore("tenant-abc");  // max active alert score
```

**Risk scores by trigger:**
- blacklist_match: 95 | chargebacks_threshold: 85 | velocity_breach / identity_mismatch: 80 | dispute_storm: 75 | payment_pattern_anomaly: 65

Alerts with riskScore ≥ 70 automatically trigger GABRIEL via the event fabric.

---

## Privilege Auditing (`privilege-auditor.ts`)

```typescript
auditPrivilege(
  "tenant-abc-user",
  "read_agent_logs",
  "audit_logs",
  "admin",       // required level
  "tenant",      // granted level
  "tenant-abc"
);
// { allowed: false, ... }  — tenant cannot access admin resources

getPrivilegeViolations("tenant-abc");  // all denied access attempts

// Execution signature for AI dispatch validation:
const sig = generateExecutionSignature("IVY", { jobId, tenantId });
validateSignature("IVY", { jobId, tenantId }, sig);  // true
```

Privilege order: public < tenant < admin < system. Any granted level below required → `allowed: false`.

---

## Tenant Isolation Audit (`tenant-isolation-audit.ts`)

```typescript
auditTenantIsolation("tenant-abc",
  recentAnomalies: 2,
  crossTenantAttempts: 1,
  sharedResourceAccesses: 0
);
// { passed: false, riskLevel: "medium", violations: ["Cross-tenant access detected"] }

getIsolationRiskTenants();  // tenants with medium or high risk
runPlatformIsolationScan(allTenantIds);  // baseline scan of all tenants
```

**Risk levels:** 0 violations → none, 1 → low, 2 → medium, 3+ → high.

---

## Security Event Types

Events emitted by the security layer:

| Event | Trigger | Handler |
|---|---|---|
| `agent_run` (GABRIEL) | Fraud alert riskScore ≥ 70 | GABRIEL governance audit |
| `sla_escalate` | Manual fraud escalation | HERALD SLA handler |

---

## Alerting Thresholds

| Metric | Threshold | Action |
|---|---|---|
| Tenant anomaly score | > 80 | Immediate review |
| Active fraud alerts | > 0 with score ≥ 85 | Block tenant operations |
| Privilege violations | > 10 in window | Security incident |
| Isolation risk tenants | Any "high" | Emergency isolation review |
