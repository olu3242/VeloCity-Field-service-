# Multi-Tenant Certification Report

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Source:** `src/lib/tenancy.ts`, `supabase/migrations/003_tenant_demarcation.sql`, `src/__tests__/tenancy.test.ts`

---

## 1. Tenant Model

VeloCity uses a shared-database, shared-schema multi-tenancy model. Every table in the public schema carries a `tenant_id UUID NOT NULL` column that links to the `tenants` table.

**Tenants table** (migration 003):
```sql
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Default tenant** (seeded in migration 003):
```
id:   00000000-0000-4000-8000-000000000001
slug: velocity-default
name: VeloCity Default Tenant
```

This UUID is the `DEFAULT_TENANT_ID` constant in `src/lib/tenancy.ts`.

---

## 2. Schema-Level Enforcement

Migration `003_tenant_demarcation.sql` adds `tenant_id` to all existing tables with these properties:
- `NOT NULL` — enforced at the database level; a row cannot be inserted without a tenant
- Foreign key to `tenants(id)` — orphan tenant IDs are rejected at the DB level
- Default value: `app.default_tenant_id()` — a PostgreSQL function returning the default UUID

Tables with `tenant_id` added in migration 003:
`profiles`, `service_areas`, `providers`, `customer_addresses`, `jobs`, `job_status_history`, `quotes`, `payments`, `reviews`, `disputes`, `provider_offers`, `subscriptions`, `notifications`, `agent_logs`, `audit_logs`

Tables from later migrations that include `tenant_id` from creation:
`automation_events`, `automation_queue`, `automation_runs`, `automation_dead_letters`, `enterprise_memory`, `execution_memories`, `workflow_snapshots`, `revenue_records`, membership tables, commercial tables, franchise tables

**Tenant-scoped indexes** (migration 003): All core tables have a `tenant_id` index for efficient per-tenant queries:
```sql
CREATE INDEX profiles_tenant_id_idx ON profiles(tenant_id);
CREATE INDEX jobs_tenant_id_idx ON jobs(tenant_id);
-- ... and 13 more
```

---

## 3. Application-Level Tenant Resolution

`src/lib/tenancy.ts` defines the tenant resolution contract for all application code.

### getTenantId(profile) — strict, throws on null

```typescript
export function getTenantId(profile?: TenantScopedProfile | null): string
```

- **Used in:** All user-facing API routes where an authenticated user is present
- **Behavior:** Returns `profile.tenant_id` if set; throws `Error("TENANT_RESOLUTION_FAILED: ...")` with `code = "TENANT_RESOLUTION_FAILED"` and `statusCode = 500` if null or undefined
- **Guarantee:** Cross-tenant data access is structurally impossible — a missing tenant_id is treated as a data integrity failure, never as "use any tenant"
- **Examples of callers:** `/api/knowledge-graph/[entityType]/[entityId]/route.ts`, `/api/digital-twin/snapshot/route.ts`, `/api/memory/route.ts`

### getTenantIdOrDefault(value, context) — safe fallback with mandatory logging

```typescript
export function getTenantIdOrDefault(tenantIdOrNull: string | null | undefined, context: string): string
```

- **Used in:** Contexts where no authenticated user is present — Stripe webhook handlers, cron jobs, the automation queue worker
- **Behavior:** Returns `tenantIdOrNull` if it's truthy; otherwise returns `DEFAULT_TENANT_ID` and emits:
  ```
  [TENANT_FALLBACK] context="<context string>" — no tenant_id found, falling back to DEFAULT_TENANT_ID. Verify this is expected.
  ```
- **Guarantee:** No silent fallback. Every fallback is visible in production logs with a caller-provided context string identifying the code path.
- **Examples of callers:** `src/app/api/webhooks/stripe/route.ts`, `src/lib/automation/router.ts`, `src/lib/automation/emitEvent.ts`, `src/lib/agents/base.ts`, `src/lib/identity/index.ts`

### withTenant(tenantId, data) — insert helper

```typescript
export function withTenant<T extends Record<string, unknown>>(tenantId: string, value: T): T & { tenant_id: string }
```

- Merges `{ tenant_id: tenantId }` into the data object before any Supabase insert
- Ensures `tenant_id` is always explicitly set rather than relying on database defaults
- Used in all table writes that do not already include `tenant_id` in the payload

---

## 4. Row Level Security

RLS is the second isolation layer, operating independently of application code. Even if an API route bug passes the wrong `tenant_id`, RLS policies prevent cross-tenant data access from user-facing clients.

**Policy patterns:**

User-facing routes use `createClient()` (anon key + user JWT). RLS policies check:
- `auth.uid() = customer_id` (or `user_id`, `actor_id` depending on table)
- `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tenant_id = table.tenant_id)` for tenant-scoped tables

Admin/worker routes use `getAdminClient()` (service_role key). The service_role key bypasses all RLS — this is intentional and documented. The service_role is used only for:
- `src/lib/supabase/admin.ts` (`getAdminClient()`)
- Admin API routes (`/api/admin/*`)
- The automation queue worker (`src/lib/automation/worker.ts`)
- Cron route handlers

The anon key client (`createClient()`) is never used in worker or admin contexts.

**RLS verification:** Confirm RLS is enabled on all tables with:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
All rows should show `rowsecurity = true`.

---

## 5. Supabase Client Separation

| Client | Function | Key used | RLS enforced | Used for |
|---|---|---|---|---|
| `createClient()` | `src/lib/supabase/client.ts` | anon key + user JWT | Yes | User-facing routes, Server Components |
| `createServerClient()` | Called in middleware, API routes | anon key + user JWT | Yes | Session refresh, user data reads |
| `getAdminClient()` | `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | No (bypassed) | Workers, admin API routes, cron jobs |

`getAdminClient()` is not re-exported from any barrel that could end up in the client bundle. Its use is audited on every code review.

---

## 6. Tenant-Aware Rate Limiting

The rate limiter in `src/middleware.ts` supports a per-tenant rate key override. When the `x-tenant-id` header is present in a request, it replaces the IP address as the rate limit key:

```
key = `${tenantId}:${pathname}`  (when x-tenant-id header present)
key = `${ip}:${pathname}`        (default, using x-forwarded-for first entry)
```

This allows enterprise customers making API-to-API calls to have their own rate bucket rather than sharing with end-user traffic from the same IP.

---

## 7. Tenant-Aware Logging

All structured log entries include `tenantId` in the log context when available. The logger (`src/lib/logger.ts`) propagates context through `withContext()`:

```typescript
const log = createLogger({ tenantId: "uuid", correlationId: "...", eventType: "..." });
log.info("Automation event processed");
// Output includes: { "tenantId": "uuid", "level": "info", ... }
```

In log aggregators, filtering by `tenantId` isolates all activity for a specific tenant across API routes, agent runs, and automation events.

---

## 8. Worker Tenant Filtering

`processAutomationQueue(supabase?, limit?, tenantId?)` in `src/lib/automation/worker.ts` accepts an optional `tenantId` parameter:

```typescript
let query = client.from("automation_queue").select("*")...;
if (tenantId) query = query.eq("tenant_id", tenantId);
```

When `tenantId` is provided, the worker processes only events for that tenant. This allows cron routes to process events for a specific tenant in isolation. When `tenantId` is omitted, the worker processes events across all tenants (using the service_role key, which bypasses RLS).

---

## 9. Known Exceptions and Documented Fallbacks

These code paths use `getTenantIdOrDefault()` rather than `getTenantId()` because they run without a user session:

| Context | `context` string logged | Reason |
|---|---|---|
| Stripe webhook handler (`/api/webhooks/stripe`) | `"stripe-webhook/<event_type>"` | Webhook arrives without a user session; tenant extracted from `metadata.tenant_id` if present |
| Automation event emitter (`src/lib/automation/emitEvent.ts`) | varies | Events emitted from internal jobs without user context |
| Automation router (`src/lib/automation/router.ts`) | varies | Event routing happens in worker context, not user context |
| Agent base (`src/lib/agents/base.ts`) | varies | Agents invoked from cron triggers |
| Identity module (`src/lib/identity/index.ts`) | varies | Internal identity resolution from external tokens |
| Dead letter writer (`src/lib/automation/worker.ts`) | Uses `DEFAULT_TENANT_ID` directly | Last resort when `row.tenant_id` is null |

All `[TENANT_FALLBACK]` log entries are searchable in Vercel logs. A fallback in a user-facing context (where `getTenantId()` should have been used) indicates a code path bug.

---

## 10. Test Coverage

`src/__tests__/tenancy.test.ts` covers the tenant isolation contract with 10 tests:

| Test | Coverage |
|---|---|
| `getTenantId` with valid profile | Returns the tenant_id |
| `getTenantId` with null tenant_id | Throws TENANT_RESOLUTION_FAILED |
| `getTenantId` with undefined profile | Throws TENANT_RESOLUTION_FAILED |
| `getTenantId` with null profile | Throws TENANT_RESOLUTION_FAILED |
| Error has correct `code` field | `code === "TENANT_RESOLUTION_FAILED"` |
| Error has correct `statusCode` field | `statusCode === 500` |
| `getTenantIdOrDefault` with valid value | Returns the value |
| `getTenantIdOrDefault` with null | Returns DEFAULT_TENANT_ID and calls console.warn |
| `getTenantIdOrDefault` log includes context | `console.warn` message includes the context string |
| `withTenant` merges tenant_id | Output object contains tenant_id |

These tests are enforced in CI (`.github/workflows/ci.yml`). A CI failure on tenant tests blocks merge to `main`.

---

## 11. Certification Summary

| Control | Status |
|---|---|
| `tenant_id NOT NULL` on all tables | Enforced at DB level via migration 003 |
| Foreign key constraint to `tenants` table | Enforced at DB level |
| RLS enabled on all tables | Enabled in migrations; verify with pg_tables query |
| `getTenantId()` throws on null (no silent fallback) | Implemented and tested |
| `getTenantIdOrDefault()` logs every fallback | Implemented; all callers use context strings |
| Service_role used only in admin/worker contexts | Audited; not re-exported to client barrels |
| Tenant-scoped logging in all structured logs | Implemented via logger context |
| Test coverage for tenant isolation contract | 10 tests in `src/__tests__/tenancy.test.ts` |
| Tenant-aware rate limiting | Implemented via `x-tenant-id` header override |
| Tenant-aware queue filtering | Implemented via optional `tenantId` param in worker |
