# Tenant Isolation Audit — Cron Routes

**Audited:** 2026-07-21  
**Scope:** All files under `src/app/api/cron/`  
**Method:** Manual read of each route; grep for `.from(table).select/update/insert` calls without a preceding `.eq("tenant_id", ...)`.

---

## Summary

| Route | Direct DB queries? | Violations found | Fixed |
|---|---|---|---|
| `cron/automation` | Yes | 6 | Yes |
| `cron/daily-intelligence` | Yes | 3 | Yes |
| `cron/payouts` | No (delegates to lib) | — | N/A |
| `cron/sla` | No (delegates to lib) | — | N/A |
| `cron/daily` | No (delegates to lib) | — | N/A |
| `cron/predictive` | Yes | 0 | N/A |

---

## Route-by-route findings

### `src/app/api/cron/automation/route.ts`

**Violations (6):**

1. `provider_offers` — `.select("id,job_id,provider_id,expires_at")` had no tenant_id filter.
2. `jobs` (SLA check) — `.select("id,status,urgency,...")` had no tenant_id filter.
3. `jobs` (stuck job detection) — second jobs query, also missing filter.
4. `payments` (failed payments) — `.eq("status", "failed")` but no tenant_id.
5. `notifications` (unsent notifications) — `.is("sent_at", null)` but no tenant_id.
6. `payments` (payout-ready) — `.in("status", ["captured", "escrowed"])` but no tenant_id.

**Fix applied:** Added `getTenantIdOrDefault(null, "cron:automation")` at the top of the handler and inserted `.eq("tenant_id", tenantId)` on all six queries.

---

### `src/app/api/cron/daily-intelligence/route.ts`

**Violations (3):**

1. `jobs` — bulk select of up to 500 rows with no tenant_id filter.
2. `providers` — bulk select of up to 500 rows with no tenant_id filter.
3. `service_areas` — bulk select of up to 100 rows with no tenant_id filter.

**Fix applied:** Added `getTenantIdOrDefault(null, "cron:daily-intelligence")` and inserted `.eq("tenant_id", tenantId)` on all three queries (inlined in the `Promise.all` call).

---

### `src/app/api/cron/payouts/route.ts`

No direct database queries. Delegates entirely to:
- `processReadyPayouts()` from `@/lib/automation/sla`
- `processAutomationQueue()` from `@/lib/automation/worker`

Both library functions handle their own scoping. **No changes needed.**

---

### `src/app/api/cron/sla/route.ts`

No direct database queries. Delegates entirely to:
- `runSLACheck()`, `detectStuckJobs()`, `detectExpiredOffers()` from `@/lib/automation/sla`
- `processAutomationQueue()` from `@/lib/automation/worker`

**No changes needed.**

---

### `src/app/api/cron/daily/route.ts`

No direct database queries. Uses `emitEvent()` (3 calls) and:
- `emitDueMembershipServices()` from `@/lib/membership/membershipLifecycle`
- `emitExpiringMemberships()` from `@/lib/membership/membershipLifecycle`
- `processAutomationQueue()` from `@/lib/automation/worker`

**No changes needed.**

---

### `src/app/api/cron/predictive/route.ts`

One direct query: `providers` table — already filtered with `.eq("tenant_id", tenantId)` using `DEFAULT_TENANT_ID` (imported from `@/lib/tenancy`). This route was already correct.

**No changes needed.**

---

## Pattern adopted for cron tenant scoping

Cron jobs that cannot assert a real user tenant resolve via:

```typescript
const tenantId = getTenantIdOrDefault(null, "cron:<routeName>");
```

This logs a `[TENANT_FALLBACK]` warning at runtime (surfaced in production logs), making any deviation from the expected default visible to ops. All direct DB queries then receive `.eq("tenant_id", tenantId)` to prevent cross-tenant data leakage.
