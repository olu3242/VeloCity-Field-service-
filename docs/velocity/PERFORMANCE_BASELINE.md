# Performance Baseline (Batch X, Phase 8)

**No live database connection or query planner is available in this environment** (consistent with every prior disclosure in this engagement — see `SERVICE_CATALOG_E2E_VALIDATION.md`). This baseline is therefore a static code-level review identifying patterns that would cause slow queries or bottlenecks, not live `EXPLAIN ANALYZE` output or measured latency numbers. Treat the findings below as a punch list for a live staging pass, not as measured facts.

## Database

- **Command Center (`src/app/admin/command-center/page.tsx`)** issues 16 parallel Supabase queries via a single `Promise.all` (jobs, providers, payments, disputes, agent_logs, service_areas, automation_queue, pricing_decisions, payout_ledger, refund_records, access_audit_logs, settings_audit_logs, persona_assignments, profiles, service_types, audit_logs) — each capped at 50-500 rows. This is parallelized (not sequential N+1), which is good, but every page load re-runs all 16 regardless of which section the admin actually views. **Hotspot**: as `jobs`/`payments`/`agent_logs` grow, the `.limit(500)` queries will eventually need a covering index on `(tenant_id, created_at)` — confirmed present for `agent_logs`, `automation_queue`, `automation_runs` (migration 002/011-013 index blocks), not separately verified for `jobs`/`payments` in this pass.
- **`src/lib/providers/getAvailableProviders.ts`** (extended in Part B with capability-aware filtering) now performs a `provider_service_capabilities` query keyed by the full candidate `providerIds` array when `service_type_id` is present — this is a single batched query (`IN (...)`), not a per-provider loop, so no N+1 was introduced by the Service Catalog extension.
- **No live row-count data** for any of the 18 orphaned tables (migrations 011-013) or the additional 19 zero-write evidence tables identified in `EVIDENCE_ARCHITECTURE_AUDIT.md` — this remains the single largest unknown for both performance and decommission-safety purposes.

## Events / Automation

- **`src/lib/automation/worker.ts`** processes `automation_queue` rows; the queue table has retry/backoff fields (`retry_count`, `next_retry_at`, `max_retries`) per migration 002, so failed events do not hot-loop. Cron-driven (`/api/cron/automation`, every 5 minutes per `vercel.json`) rather than continuously polling — bounded by design.
- **Router (`src/lib/automation/router.ts`)** writes an unconditional `agent_logs` row (GABRIEL governance audit) after every event, plus a handler-specific write — meaning every event produces at least 2 evidence writes. At high event volume this doubles write load on `agent_logs`; no batching exists. Not a current bottleneck at observed (pre-launch) volume, but the first place to look if event throughput becomes a constraint.

## Agents

- `BaseAgent.run()` (`src/lib/agents/base.ts`) logs `latency_ms` per call already — this is the correct instrumentation point for a future live baseline; no code change needed to start collecting real numbers once a live database exists.
- No agent performs unbounded work (e.g., no agent iterates all jobs/providers without a tenant/category filter) based on the file reads performed across this and the prior batch.

## Dispatch

- `MAX.match()` → `getAvailableProviders.ts`: category-filtered first, then capability-filtered via one batched query (see above). No full-table provider scan identified.
- `/api/admin/dispatch/route.ts:74` calls `max.match()` synchronously in the request path — for a small provider pool (current scale) this is fine; if provider counts grow into the thousands per category, this becomes the first dispatch-latency hotspot since there's no caching/pre-ranking layer.

## Recommendation

Run a live staging pass with `EXPLAIN ANALYZE` on the Command Center's 16 queries and on `getAvailableProviders` under realistic data volume before the next scale-up batch. This is the same gap repeatedly disclosed in this engagement (no live Supabase project available here) and is the top item for `VELOCITY_FOUNDATION_READINESS.md`'s "What Remains Risky."
