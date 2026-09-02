# Database Decommission Plan

**This document does not drop anything.** Per explicit instruction, no DROP migration is created in this batch. This plan lists exactly which tables qualify for removal based on `DATABASE_DECOMMISSION_AUDIT.md`, and what must be confirmed live before a DROP migration is approved.

## Tables that are safe-to-remove candidates (pending live row-count confirmation)

All 18 tables created by migrations 011, 012, and 013:

1. `stateful_workflow_states`
2. `workflow_temporal_history`
3. `governance_violations`
4. `simulation_runs`
5. `federation_network_nodes`
6. `cloud_execution_slots`
7. `neural_execution_graph`
8. `workflow_evolution_cycles`
9. `orchestration_mutations`
10. `cognition_lineage`
11. `autonomous_actions_audit`
12. `intelligence_mesh_exchanges`
13. `runtime_trace_lineage`
14. `execution_ancestry_log`
15. `determinism_verifications`
16. `safety_evaluations`
17. `governance_overrides_log`
18. `performance_metrics`

Every one of these has, per the audit: zero application code reads/writes, zero foreign-key relationships (incoming or outgoing), zero triggers, zero views or functions built on top of them, and zero cron jobs touching them. `governance_violations` has two inert string-literal references in static UI/registry metadata (not functional reads/writes), which does not change its classification.

## Required confirmation before a DROP migration is created

Run the following against the live Supabase project (not done in this session — no live database connection is available here):

```sql
select 'stateful_workflow_states' as table_name, count(*) from stateful_workflow_states
union all select 'workflow_temporal_history', count(*) from workflow_temporal_history
union all select 'governance_violations', count(*) from governance_violations
union all select 'simulation_runs', count(*) from simulation_runs
union all select 'federation_network_nodes', count(*) from federation_network_nodes
union all select 'cloud_execution_slots', count(*) from cloud_execution_slots
union all select 'neural_execution_graph', count(*) from neural_execution_graph
union all select 'workflow_evolution_cycles', count(*) from workflow_evolution_cycles
union all select 'orchestration_mutations', count(*) from orchestration_mutations
union all select 'cognition_lineage', count(*) from cognition_lineage
union all select 'autonomous_actions_audit', count(*) from autonomous_actions_audit
union all select 'intelligence_mesh_exchanges', count(*) from intelligence_mesh_exchanges
union all select 'runtime_trace_lineage', count(*) from runtime_trace_lineage
union all select 'execution_ancestry_log', count(*) from execution_ancestry_log
union all select 'determinism_verifications', count(*) from determinism_verifications
union all select 'safety_evaluations', count(*) from safety_evaluations
union all select 'governance_overrides_log', count(*) from governance_overrides_log
union all select 'performance_metrics', count(*) from performance_metrics;
```

If every row returns `0`, the static-analysis findings in the audit are fully corroborated and a DROP migration can be created with no data-loss risk.

If any table returns a non-zero count, do not drop that table yet — investigate where those rows came from (manual SQL, a seed script outside this repo, or a code path missed by this audit) before proceeding.

## What the eventual DROP migration would contain (for approval reference only — not created in this batch)

A new migration, e.g. `017_remove_orphaned_runtime_tables.sql`, that:
- Drops all 18 tables listed above (`DROP TABLE IF EXISTS <table> CASCADE;` for each)
- Removes the 3 `ALTER PUBLICATION supabase_realtime ADD TABLE ...` realtime registrations for the tables that have them (`stateful_workflow_states`, `governance_violations`, `cloud_execution_slots`, `autonomous_actions_audit`, `intelligence_mesh_exchanges`, `safety_evaluations`, `governance_overrides_log`) — Postgres will otherwise leave a dangling publication reference
- Is itself additive-safe to run (idempotent `IF EXISTS`), reversible only by re-running migrations 011-013 (which would recreate empty tables, not restore data — hence why live row-count confirmation matters first)

## Addendum (Batch X): Per-table dependency analysis and rollback plan

Dependency analysis and rollback plan are identical across all 18 tables because they share the same structural profile (no FKs in or out, no triggers, no seed rows, no agent/workflow references — see `DATABASE_DECOMMISSION_AUDIT.md` addendum). Stated once here per table to satisfy Batch X's per-table requirement, since restating 18 identical paragraphs would not add information:

| Table | Dependency analysis | Rollback plan |
|---|---|---|
| `stateful_workflow_states`, `workflow_temporal_history`, `governance_violations`, `simulation_runs`, `federation_network_nodes`, `cloud_execution_slots`, `neural_execution_graph`, `workflow_evolution_cycles`, `orchestration_mutations`, `cognition_lineage`, `autonomous_actions_audit`, `intelligence_mesh_exchanges`, `runtime_trace_lineage`, `execution_ancestry_log`, `determinism_verifications`, `safety_evaluations`, `governance_overrides_log`, `performance_metrics` | No incoming FK (nothing else in the schema points at these tables' primary keys). No outgoing FK (their own `tenant_id`/entity columns are bare `uuid`, not declared `references` anything). No trigger, view, or function depends on them. No agent or automation handler reads/writes them (confirmed in this batch's evidence sweep). Dropping any subset independently of the others carries zero cross-table risk — they can be dropped individually or all at once with identical safety. | `DROP TABLE IF EXISTS <table> CASCADE` is the only operation needed (`CASCADE` is a no-op here since there are no dependents). Reversal = re-run the originating migration (011, 012, or 013) to recreate an **empty** table with the same schema/indexes/RLS — this restores structure, not data. If the live row-count check (below) ever finds non-zero rows, the rollback plan changes to "do not drop; export rows to a backup table first," which is exactly why that check is a hard precondition, not a formality. |

## Sequencing

This plan is submitted for review now that Part A (Agent Activation) and Part B (Service Catalog) are both complete and certified, per the user's required sequence. **No DROP migration will be created until the user reviews this plan and the audit, and explicitly approves proceeding** — and even then, only after the live row-count query above confirms zero rows.
