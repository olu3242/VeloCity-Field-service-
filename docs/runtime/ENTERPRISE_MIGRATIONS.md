# VeloCity Enterprise Migrations

## Overview

The enterprise migration system (`src/lib/migrations/`) tracks migration lifecycle, validates pre-migration safety conditions, and manages rollback plans — ensuring every platform evolution is safe, auditable, and reversible.

---

## Migration Registry (`migration-registry.ts`)

```typescript
const m = registerMigration(
  "Add HERALD to dispute workflow",
  "2.1.0",
  "Routes SLA escalations through HERALD notification agent",
  true  // rollbackAvailable
);
// m.status = "pending"

startMigration(m.id);
// throws if isRuntimePaused() — "Cannot start migration: runtime is paused"
// m.status = "running"

completeMigration(m.id, "ops-lead");
// m.status = "completed", m.appliedBy = "ops-lead", m.completedAt set

failMigration(m.id, "HERALD latency spike");
// m.status = "failed", reason appended to description

getMigrationsByStatus("completed");
getLatestMigrations(10);  // sorted by createdAt desc
```

**Cap:** 100 migrations.

---

## Schema Guard (`schema-guard.ts`)

Pre-migration safety validation:

```typescript
runSchemaGuard();
// {
//   checks: [4 checks],
//   passed: 4,
//   failed: 0,
//   criticalFailures: [],
//   safeToMigrate: true,
//   generatedAt: "...",
// }
```

**Checks:**

| Check | Critical | Passes When |
|---|---|---|
| agents-present | ❌ | AGENT_REGISTRY has ≥ 5 agents |
| governance-active | ✅ | `getOperatorState()` returns value |
| no-open-circuits | ❌ | open circuit count ≤ 3 |
| runtime-not-paused | ✅ | `!isRuntimePaused()` |

`safeToMigrate` = no critical failures.

---

## Rollback Manager (`rollback-manager.ts`)

```typescript
const plan = createRollbackPlan(m.id, "Revert HERALD routing change", [
  "Restore original escalation-chain config",
  "Redeploy prior worker version",
  "Verify SLA timers firing correctly",
]);

executeRollback(m.id);
// returns null if isRuntimePaused() or plan unavailable
// plan.status = "executed", plan.executedAt set

getRollbackPlan(m.id);
getAvailableRollbacks();  // plans with status = "available"
```

---

## Migration Gate

Recommended sequence:

```
1. runSchemaGuard() → safeToMigrate must be true
2. registerMigration() + createRollbackPlan()
3. startMigration() — blocked if runtime paused
4. Execute migration steps
5. completeMigration() on success
6. executeRollback() if issues detected
```
