# Membership Engine Certification (Batch X+2, Phase 13)

| Criterion | Status | Evidence |
|---|---|---|
| Extends Service Catalog, no parallel benefits system | ✅ | `membership_entitlements.service_type_id` references `service_types(id)` and `service_package_id` references `service_packages(id)` directly; every benefit is a Category → Service Type → Package mapping, never a hardcoded string |
| Domain model extends existing structures, does not replace | ✅ | `MEMBERSHIP_AUDIT.md` documents the dead `subscriptions` table (migration 001) and dead `subscription_due` automation event; the new `membership_*` tables follow the same customer/plan/interval/amount/status/next_service_date shape and the dead `subscription_due` event is reactivated by `emitDueMembershipServices()` rather than duplicated |
| Plan Catalog (5 plans × 3 billing frequencies) | ✅ | `supabase/migrations/20260530000002_membership_engine.sql` seeds Home Care, HVAC Care, Plumbing Protection, Handyman Care, Commercial Maintenance, each with Monthly/Quarterly/Annual rows in `membership_plan_pricing` |
| Service Entitlements derived from Service Catalog | ✅ | `membership_entitlements` rows reference real `service_types`/`service_packages`; `src/lib/membership/membershipCatalog.ts` reads entitlements joined to `service_types(name)`, never a static list |
| Revenue traceable Customer → Membership → Entitlement → Booking → Revenue Record | ✅ | `membership_subscriptions.customer_id` → `membership_subscriptions.id` → `membership_usage.entitlement_id` → `jobs.membership_subscription_id` → `revenue_records.membership_subscription_id`, all real foreign keys, confirmed by schema inspection in `MEMBERSHIP_ENGINE_E2E_VALIDATION.md` |
| Single write path (no scattered mutation) | ✅ | `src/lib/membership/membershipLifecycle.ts` is the only file that inserts/updates `membership_subscriptions`/`membership_usage`/`membership_events`; traced exhaustively in the E2E validation doc |
| RLS enforced, tenant-scoped | ✅ | All 6 tables have `tenant_id` defaulting to `app.default_tenant_id()` and RLS policies matching the `do $$ if not exists ... $$` pattern from migrations 016/017 |
| Migration idempotent | ✅ | Dual-apply test against local Postgres stub: first apply clean, second apply "already exists, skipping" / `INSERT 0 0` for every statement |
| Build/lint/typecheck pass | ✅ | `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean |

**Status: CERTIFIED ✅** — The Membership Engine is a Service-Catalog-driven extension of the existing data model, with one write path, full revenue traceability, and zero hardcoded benefits.
