# VeloCity Platform Evolution Control

## Overview

The platform evolution control layer (`src/lib/evolution-control/`) governs safe platform migrations — verifying runtime compatibility before changes, enforcing migration safeguards, and rolling out features gradually via percentage-based tenant gating.

---

## Compatibility Checker (`compatibility-checker.ts`)

Validates platform invariants before any migration:

```typescript
const report = await runCompatibilityChecks();
// {
//   checks: [5 checks],
//   passed: 5,
//   failed: 0,
//   breakingChanges: [],
//   safeToMigrate: true,
//   generatedAt: "...",
// }
```

**Checks performed:**

| Check | Category | Breaking | Passes When |
|---|---|---|---|
| agent-registry-stable | agent_contract | ❌ | ≥ 5 agents in AGENT_REGISTRY |
| governance-intact | governance | ✅ | `getOperatorState()` returns well-typed value |
| circuits-healthy | governance | ❌ | ≤ 2 open circuits |
| effectiveness-baseline | api_contract | ✅ | composite effectiveness ≥ 50 |
| ai-policy-active | event_types | ❌ | IVY/dispute_opened action ≠ "deny" |

`safeToMigrate` = no breaking check failures.

---

## Migration Safeguards (`migration-safeguards.ts`)

```typescript
const plan = createMigrationPlan({
  name: "Add HERALD to dispute workflow",
  description: "Route SLA escalations through HERALD",
  targetVersion: "2.1.0",
  rollbackAvailable: true,
});
// plan.riskLevel escalated to "high" if isRuntimePaused()

approveMigration(plan.id);
startMigration(plan.id);   // status: "executing"
completeMigration(plan.id); // status: "completed"

rollbackMigration(plan.id, "Unexpected latency increase");
// only if plan.rollbackAvailable = true

getMigrationHistory();
```

**Status flow:** `draft` → `approved` → `executing` → `completed` | `rolled_back`

---

## Rollout Controller (`rollout-controller.ts`)

Percentage-based feature flag rollout with certification gating:

```typescript
registerFeature({
  featureId: "ai-marketplace-v2",
  name: "AI Marketplace v2",
  tenantRolloutPct: 10,      // start at 10% of tenants
  requiresCertification: true,
  minCertificationLevel: "premium",
  enabled: false,
});

activateFeature("ai-marketplace-v2");

isFeatureEnabled("ai-marketplace-v2", tenantIndex, totalTenants);
// true if (tenantIndex / totalTenants) × 100 ≤ tenantRolloutPct

updateRolloutPct("ai-marketplace-v2", 50);  // expand to 50%
deactivateFeature("ai-marketplace-v2");

getAllFeatures();  // full registry
```

---

## Evolution Gate

Recommended pre-migration checklist:

```
1. runCompatibilityChecks() → safeToMigrate must be true
2. createMigrationPlan() + approveMigration()
3. registerFeature() with tenantRolloutPct = 5 (canary)
4. activateFeature() → monitor for 24h
5. updateRolloutPct() → 25 → 50 → 100 (progressive rollout)
6. completeMigration() on success, rollbackMigration() on failure
```
