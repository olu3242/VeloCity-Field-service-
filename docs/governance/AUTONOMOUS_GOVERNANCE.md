# VeloCity Autonomous Governance

## Overview

The autonomous governance layer (`src/lib/autonomous-governance/`) continuously scores governance health, tracks policy performance analytics, and detects governance drift — enabling self-monitoring compliance enforcement without manual intervention.

---

## Governance Health Scoring (`governance-health.ts`)

```typescript
scoreGovernanceHealth();
// {
//   score: 75,
//   level: "healthy",
//   checks: [
//     { name: "operator-state", passed: true, weight: 0.25 },
//     { name: "runtime-not-paused", passed: true, weight: 0.25 },
//     { name: "circuits-closed", passed: true, weight: 0.25 },
//     { name: "resilience-passing", passed: true, weight: 0.25 },
//   ],
// }

recordHealthSnapshot();   // scores + appends to HEALTH_HISTORY (cap 100)

getHealthTrend();
// "improving" | "stable" | "degrading"
// compares avg of last 3 snapshots vs prior 3 — delta > 5 = improving/degrading
```

**Levels:** healthy (≥75) | degraded (≥50) | critical (<50)

**Checks:** `operator-state` (0.25) + `runtime-not-paused` (0.25) + `circuits-closed` (0.25) + `resilience-passing` (0.25)

---

## Policy Analytics (`policy-analytics.ts`)

```typescript
recordPolicyEvaluation("acc-001", true, 12);   // passed in 12ms
recordPolicyEvaluation("acc-001", false, 8);   // failed in 8ms

getPolicyMetrics("acc-001");
// { policyId, evaluationCount: 2, passRate: 0.5, avgResponseMs: 10, lastEvaluatedAt }

getUnderperformingPolicies(0.8);
// policies where passRate < 0.8

getPolicyAnalyticsSummary();
// { totalEvaluations, avgPassRate, mostEvaluated: PolicyMetric }
```

Rolling average: each new `responseMs` blends with prior avg using `(prior × (n-1) + new) / n`.

---

## Drift Detection (`drift-detector.ts`)

```typescript
detectDrift();
// runs live checks and returns newly detected GovernanceDrift[]
// circuit_accumulation: open circuits > 2 → medium severity
// policy_bypass: runtime paused + open circuits > 0 → high severity

resolveDrift(drift.id);

getActiveDrifts();
// all unresolved drifts

getDriftSummary();
// { total: 7, active: 3, bySeverity: { medium: 4, high: 3 } }
```

**Drift types:** `circuit_accumulation` | `policy_bypass` | `rule_degradation` | `approval_backlog`

**Cap:** 100 drift records.

---

## Recommended Governance Loop

```
Scheduled (every 5 min):
  recordHealthSnapshot()
  detectDrift() → alert on new high-severity drifts
  executeAllPolicies() → recordPolicyEvaluation() for each

On alert:
  getHealthTrend() + getDriftSummary() → executive briefing
  resolveDrift() after remediation
```
