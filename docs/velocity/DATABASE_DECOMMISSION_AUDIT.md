# Database Decommission Audit

Scope: every table created by `supabase/migrations/011_runtime_platform.sql`, `012_neural_runtime.sql`, and `013_runtime_consolidation.sql` — 18 tables total. This is a read-only audit. **No tables are dropped or altered by this document or this batch.**

## Methodology

For each table, the repository (not a live database connection — no live Supabase project is available in this environment) was searched for:
- **Application code references**: `.from("<table>")` or any string reference to the table name in `src/**/*.ts(x)`
- **Foreign keys**: any `references <table>` clause in any migration, and any FK columns declared inside the table's own `CREATE TABLE` statement
- **Triggers**: any `CREATE TRIGGER` referencing the table, in its own migration or any other
- **Views/functions**: any other migration file mentioning the table name (would indicate a view or function built on top of it)
- **Cron jobs**: `vercel.json` cron paths and the route handlers they call (`src/app/api/cron/*`)
- **Policies**: RLS policies are declared inline in the table's own migration (captured below)
- **Seed/insert statements**: any `INSERT INTO <table>` in any migration

**Row counts and "last updated" timestamps cannot be determined without a live database connection.** Since every table below has zero application write paths (no code anywhere calls `.from("<table>").insert/update/upsert`), the expected row count is 0 unless something inserted rows manually outside the app (e.g., directly via SQL). This should be confirmed with a live `select count(*)` query before final removal, noted as an open item in the Decommission Plan.

## Findings

All 18 tables below were created by additive migrations with full RLS policies and indexes, following the same professional conventions as the rest of the schema, but were never wired to any application code path. They follow the identical naming/pattern style to a separate batch of orphaned `src/` runtime-framework code (a "Neural Runtime" / "Federation" / "Governance Audit" simulation layer) that was deleted earlier in this engagement for having zero real callers — these tables are that same fictional framework's persistence layer, created but never connected.

| Table (migration) | Indexes | FKs (in/out) | Triggers | RLS Policy | Views/Functions referencing it | Cron jobs referencing it | App code references | Seed rows | Classification |
|---|---|---|---|---|---|---|---|---|---|
| `stateful_workflow_states` (011) | none (besides PK/unique on `workflow_id`) | none | none | `stateful_workflow_states_tenant_policy` (tenant_id = auth.uid() OR null) | none | none | **0** | none | **ORPHANED** |
| `workflow_temporal_history` (011) | `idx_wth_workflow_sequence`, `idx_wth_tenant_id`, `idx_wth_event_type` | none | none | `workflow_temporal_history_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `governance_violations` (011) | 4 indexes | none | none | `governance_violations_tenant_policy` | none | none | **2** — both are *string literals* in static UI/registry metadata (`src/app/admin/lax/page.tsx:433-434` permission labels, `src/lib/registry/runtimes.ts:185` table-ownership label); **zero** `.from("governance_violations")` calls exist anywhere | none | **ORPHANED** (descriptive-only references, not functional reads/writes) |
| `simulation_runs` (011) | 3 indexes | none | none | `simulation_runs_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `federation_network_nodes` (011) | 3 indexes | none | none | `federation_network_nodes_open_policy` (open to all authenticated) | none | none | **0** | none | **ORPHANED** |
| `cloud_execution_slots` (011) | 4 indexes | none | none | `cloud_execution_slots_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `neural_execution_graph` (012) | 2 indexes | none | none | `neural_execution_graph_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `workflow_evolution_cycles` (012) | 3 indexes | none | none | `workflow_evolution_cycles_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `orchestration_mutations` (012) | 4 indexes | none | none | `orchestration_mutations_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `cognition_lineage` (012) | 3 indexes | none | none | `cognition_lineage_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `autonomous_actions_audit` (012) | 4 indexes | none | none | `autonomous_actions_audit_tenant_policy` | none | none | **0** | none | **ORPHANED** |
| `intelligence_mesh_exchanges` (012) | 3 indexes | none | none | `intelligence_mesh_exchanges_tenant_policy` (open) | none | none | **0** | none | **ORPHANED** |
| `runtime_trace_lineage` (013) | 4 indexes | none | none | `tenant_isolation_runtime_trace_lineage` | none | none — confirmed `/api/runtime/trace/[id]` (the one route that sounds related) actually queries only `automation_events`, `automation_queue`, `automation_runs`, `agent_logs`, `audit_logs` — none of the 18 audited tables | **0** | none | **ORPHANED** |
| `execution_ancestry_log` (013) | 4 indexes | none | none | `tenant_isolation_execution_ancestry_log` | none | none | **0** | none | **ORPHANED** |
| `determinism_verifications` (013) | 3 indexes | none | none | `tenant_isolation_determinism_verifications` | none | none | **0** | none | **ORPHANED** |
| `safety_evaluations` (013) | 5 indexes | none | none | `tenant_isolation_safety_evaluations` | none | none | **0** | none | **ORPHANED** |
| `governance_overrides_log` (013) | 4 indexes | none | none | `tenant_isolation_governance_overrides_log` | none | none | **0** | none | **ORPHANED** |
| `performance_metrics` (013) | 4 indexes | none | none | `tenant_isolation_performance_metrics` | none | none | **0** | none | **ORPHANED** |

## Classification rule applied

Per the required criteria, a table is a removal candidate only if it has: zero code references, zero FK references, zero trigger references, zero function references, zero policy *dependents* (the table's own RLS policy doesn't count against it — that's normal schema hygiene, not a dependency), and zero rows (or only archived rows).

All 18 tables meet every criterion except the live row-count check, which requires a database connection not available in this environment. `governance_violations` has 2 references, but both are inert string labels in static metadata objects (no `.from()` call, no read, no write) — they do not constitute a functional dependency.

## Conclusion

All 18 tables from migrations 011/012/013 are classified **ORPHANED**. None are referenced by application code, foreign keys, triggers, views, functions, or cron jobs. They are recommended as decommission candidates, pending live confirmation of zero rows (see `DATABASE_DECOMMISSION_PLAN.md`).

## Addendum (Batch X): Agent references, workflow references, last-updated timestamps

Cross-checked against the independent Batch X registry/framework inventory (`RUNTIME_CONVERGENCE_AUDIT.md`) and evidence/logging inventory (`EVIDENCE_ARCHITECTURE_AUDIT.md`):

- **Agent references**: Zero. No agent file (`src/lib/agents/*.ts`), no automation handler (`src/lib/automation/handlers/*.ts`), and no call to `runAgent()` references any of the 18 tables. `agent_logs` (the real, AUTHORITATIVE evidence table for every agent call — written unconditionally by `src/lib/agents/base.ts`) contains zero rows pointing at these tables because no agent ever queries or writes them.
- **Workflow references**: Zero. The real job workflow engine — `src/lib/workflows/job-state-machine.ts` (`canTransition()`, enforced at `src/app/api/jobs/[id]/transition/route.ts:64`) and its evidence table `job_status_history` — does not read or write any of the 18 tables, including `stateful_workflow_states` and `workflow_temporal_history`, whose names most resemble workflow infrastructure. Confirmed via the Batch X evidence-table sweep: `workflow_temporal_history` has **0 write call sites anywhere in `src/`**.
- **Last-updated timestamps / row counts**: Still cannot be determined without a live database connection (unchanged from the original audit). The Batch X sweep adds no new evidence here since it is static-analysis-only, same as before — this remains the single open item before any DROP migration, per `DATABASE_DECOMMISSION_PLAN.md`.
- **Net effect on classification**: No change. All 18 tables remain **ORPHANED** under the stricter Batch X criteria (zero app code, zero FK, zero trigger, zero view/function, zero cron, **zero agent, zero workflow** references).
