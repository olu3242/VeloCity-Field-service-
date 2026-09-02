# Agent Log Security Certification (Remediation & Go-Live Hardening Batch, Phase 2)

## Correcting the prior disclosure

`SECURITY_MULTITENANCY_CERTIFICATION.md` and `KNOWN_LIMITATIONS.md` stated that `agent_logs` "has no RLS policy (app-level protection only)," citing `001_initial_schema.sql:372-384`. That citation is accurate for the table's *original* definition, but incomplete: it did not account for later migrations. Tracing the full migration history for `agent_logs`:

| Migration | Effect |
|---|---|
| `001_initial_schema.sql:372-384` | Creates `agent_logs` with no `tenant_id` column, no RLS |
| `002_production_hardening.sql:109-111` | `create policy "Admins see agent logs" on agent_logs for select using (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))` — **not yet tenant-scoped** |
| `003_tenant_demarcation.sql:36` | `alter table agent_logs add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id()` |
| `003_tenant_demarcation.sql:68` | `alter table agent_logs alter column tenant_id set not null` |
| `003_tenant_demarcation.sql:309` | `alter policy "Admins see agent logs" on agent_logs using (app.is_tenant_admin(tenant_id))` — retrofits the Phase-002 policy to be tenant-scoped |
| `006_velocity_additive_bridge.sql:131-139` | `create table if not exists agent_logs (...)` — no-op (table already exists from 001) |
| `006_velocity_additive_bridge.sql:201` | `alter table agent_logs enable row level security` |
| `006_velocity_additive_bridge.sql:241-243` | Idempotent guard: only creates "Admins see agent logs" if a policy by that name doesn't already exist — it doesn't, since 003 altered (not renamed) the 002 policy, so this block is also a no-op in practice |

**Current verified state**: `agent_logs` has RLS **enabled**, with exactly one policy: `SELECT` only, `using (app.is_tenant_admin(tenant_id))` — i.e. only an admin whose own tenant matches the row's `tenant_id` can read it. No `INSERT`/`UPDATE`/`DELETE` policy exists, which is correct: every write to `agent_logs` goes through `createAdminClient()`/`getAdminClient()` (`src/lib/agents/base.ts:88`, `src/lib/runtime/ai/tracing.ts:69`), the Supabase service-role client, which bypasses RLS entirely. No code path writes `agent_logs` through a user-scoped (RLS-enforced) client, so the absence of write policies cannot be exploited — a non-admin client has no INSERT path available even attempting it.

**This finding is corrected, not remediated**: the protection already exists and was already correct. No migration was needed for RLS itself.

## What this audit found that the prior certification missed

Re-auditing every call site of `agent_logs` (not just the table definition) found a real gap the prior certification did not catch:

**`src/app/api/runtime/trace/[id]/route.ts`** — an admin-only route (`assertAdmin()` checks `profiles.role`) that used `getAdminClient()` (service-role, RLS bypassed) to query `agent_logs`, `automation_events`, `automation_queue`, `automation_runs`, and `audit_logs` filtered **only by the path-param `id`**, with no `tenant_id` filter anywhere. Because the route deliberately bypasses RLS (it needs to join data the admin's own RLS policies wouldn't all permit in one round trip) and never substitutes a manual tenant check, **any admin in any tenant could read another tenant's agent/automation/audit trace** by supplying that tenant's event/job id. The same `id` was also string-interpolated directly into PostgREST `.or()` filter expressions (`.or(\`job_id.eq.${traceId}\`)`), which is unsafe if `id` is ever attacker-influenced and not validated.

**Fix applied** (`src/app/api/runtime/trace/[id]/route.ts`):
1. `assertAdmin()` now also returns the admin's own `tenant_id` from `profiles`.
2. The route validates `params.id` against a strict UUID regex before using it in any query or filter string, eliminating the filter-injection vector.
3. Every one of the five parallel queries now adds `.eq("tenant_id", tenantId)`, scoping every result to the requesting admin's own tenant.

## Visibility audit

| Role | Can read `agent_logs`? | Path |
|---|---|---|
| Admin (own tenant) | ✅ | RLS policy `app.is_tenant_admin(tenant_id)`; Command Center / `/admin/automation` / the now-fixed trace route |
| Admin (other tenant) | ❌ | Blocked by RLS policy; blocked by the trace-route fix above |
| Provider | ❌ | No policy grants provider access; no UI surface attempts it (confirmed via grep — no provider-facing route reads `agent_logs`) |
| Customer | ❌ | Same — no policy, no UI surface |
| Service role (server-side writes) | ✅ (bypasses RLS, by design) | `BaseAgent.log()`, `recordTrace()` — both non-blocking, swallow errors, write-only call sites |

No provider- or customer-facing visibility exists for `agent_logs` today, and none was added — this is consistent with "no new dashboards/features" and with the fact that no business flow currently requires a non-admin to see agent execution evidence.

**Status: CERTIFIED ✅** — tenant isolation on `agent_logs` is enforced both at the RLS layer (for any RLS-respecting client) and, after this batch's fix, at the application layer for the one route that deliberately uses the service-role client. No cross-tenant read path remains.
