# Franchise OS Certification (Franchise OS Batch, Phases 1–5)

Certification of the VeloCity Franchise Operator Surface — the five Franchise OS phases that deliver a full read-capable franchise owner portal on top of the existing multi-tenant data model, without introducing any new agents, automation handlers, or background services.

## Phase matrix

| Phase | What was built | Status |
|---|---|---|
| 1 — Foundation | RLS migration, `vercel.json` cron fix, dashboard data fix | ✅ Certified |
| 2 — Territory Intelligence | `/franchise/territory` page | ✅ Certified |
| 3 — Revenue Intelligence | `/franchise/revenue` page | ✅ Certified |
| 4 — Provider Management | `/franchise/providers` page | ✅ Certified |
| 5 — Certification | This document | ✅ Complete |

---

## Phase 1 — Foundation

### Finding: franchise dashboard was silently returning no territories

The existing `src/app/franchise/dashboard/page.tsx` queried `franchise_territories` with `.eq("owner_user_id", user.id)`. The `franchise_territories` table (migration `004_growth_intelligence.sql`) has no `owner_user_id` column — the owner-to-territory relationship is through `territory_operators.profile_id`. The dashboard was always showing "No territories assigned" regardless of actual assignments.

**Fix**: Changed the query to first fetch `territory_operators` rows where `profile_id = user.id`, extract the `territory_id` list, then fetch `franchise_territories` using `.in("id", territoryIds)`.

### Finding: franchise owners could not read their own territory data via auth client

All tables in the `franchise_territories` family (`territory_operators`, `territory_scorecards`, `expansion_recommendations`, `local_market_snapshots`) had RLS policies scoped exclusively to `app.is_tenant_admin()`. A user with `role = "franchise_owner"` could not read any of their own territory data, making every `/franchise/*` page dependent on a service-role bypass.

**Fix**: Added `supabase/migrations/018_franchise_os_rls.sql` with five additive SELECT policies (one per table). Each policy for the territory-related tables gates access through a subquery on `territory_operators.profile_id = auth.uid()`, so a franchise owner can read exactly the territories, scorecards, recommendations, and snapshots they are assigned to operate — and nothing else.

`revenue_records` already had the correct RLS policy (`franchise_owner_id = auth.uid()`, migration `20260530000001`) — no change needed.

### Finding: three cron routes were built, auth-gated, and functional but never scheduled

`/api/cron/sla`, `/api/cron/payouts`, and `/api/cron/daily` were absent from `vercel.json` — closing the go-live condition from `VELOCITY_GO_LIVE_DECISION.md`. Added all three with schedules matching the design intent documented in `docs/automation/AUTOMATION_IMPLEMENTATION_PLAN.md`:
- `/api/cron/sla` — every minute
- `/api/cron/payouts` — hourly at minute 0
- `/api/cron/daily` — daily at 03:00 UTC

### Dashboard improvements

Added real 30-day royalty KPI (from `revenue_records` with RLS scope) replacing the placeholder "$—". Added territory location (city/state) and zip codes to the territory table. Added a 30-day revenue summary card when revenue records exist.

---

## Phase 2 — Territory Intelligence (`/franchise/territory`)

**Source tables**: `territory_operators` (auth scope), `franchise_territories` (new franchise-owner RLS), `territory_scorecards` (new RLS), `expansion_recommendations` (new RLS), `local_market_snapshots` (new RLS).

**What's shown**:
- Per-territory scorecard cards: demand index, supply index, readiness score, provider count, jobs completed, revenue, SLA hit rate, dispute rate, active customer count.
- Expansion recommendations sorted by score, labeled by territory.
- Local market snapshots table: location, category, demand level, supply level, median ticket.
- All data is scoped to the franchise owner's assigned territories via the `territory_operators` subquery in RLS.

**Evidence**: `franchise_territories`, `territory_scorecards`, `expansion_recommendations`, and `local_market_snapshots` are all real tables (migration `004_growth_intelligence.sql`), populated by the `daily_territory_analysis` event handler (`src/lib/automation/handlers/tess-territory.ts`) and the daily intelligence cron (`/api/cron/daily-intelligence`). The page shows "No scorecard yet — runs after first automation cycle" when no data exists, rather than fabricating values.

---

## Phase 3 — Revenue Intelligence (`/franchise/revenue`)

**Source table**: `revenue_records` (migration `20260530000001_revenue_records.sql`), RLS policy `franchise_owner_view_own_revenue` already present: `franchise_owner_id = auth.uid()`.

**What's shown**:
- KPI row: all-time royalty, 30-day royalty, unsettled royalty, all-time gross volume.
- Revenue split card: gross → provider payout → platform fee → franchise royalty (yours) → net platform.
- Revenue by territory breakdown.
- Full transaction ledger: date, event type, territory, gross, royalty, settlement status.

**Revenue record structure**: `revenue_records` captures `gross_amount_cents`, `platform_fee_cents`, `provider_payout_cents`, `franchise_royalty_cents`, and the generated column `net_platform_cents` per job payment. The `franchise_owner_id` FK links each record to the franchise owner profile; the `franchise_territory_id` FK links to the territory. Both are already populated by `src/lib/automation/handlers/finn-payment.ts`'s write path.

---

## Phase 4 — Provider Management (`/franchise/providers`)

**Source tables**: `territory_operators` → `franchise_territories` (zip_codes) → `service_areas` (zip_codes) → `providers` (service_area_ids, trust_score, completed_jobs).

**Provider matching logic**: Franchise territory zip codes are extracted from the owner's `franchise_territories` rows. Service areas whose `zip_codes` array overlaps the territory zip codes are found by fetching all active `service_areas` and filtering in application code. Providers whose `service_area_ids` overlap the matching service area IDs are then fetched using Supabase's `.overlaps()` array-overlap operator. This is the correct relationship chain: providers → service areas → geographic zip codes → franchise territory.

**What's shown**:
- KPI row: total providers, approved, online now, average trust score.
- Territory coverage note showing zip codes covered.
- Provider table: business name, categories, status, trust score (color-coded), completed jobs, cancellation rate, years experience, online/offline indicator.

**RLS note**: `service_areas` has no RLS (global catalog, no `tenant_id`); `providers` uses tenant-scoped RLS (`app.is_tenant_admin` for mutation; `approved_visible_to_all` for read by authenticated users). The auth-scoped client reads `providers` via the existing "Approved providers visible to all" RLS policy — no new policy needed.

---

## Acceptance gate

| Item | Status | Evidence |
|---|---|---|
| Dashboard territory query fixed | ✅ | `.eq("owner_user_id")` replaced by `territory_operators` join |
| Franchise owner RLS added (5 tables) | ✅ | `supabase/migrations/018_franchise_os_rls.sql` |
| `vercel.json` cron gap closed | ✅ | 3 cron routes added (sla, payouts, daily) |
| `/franchise/territory` built | ✅ | Real data from scorecards, recommendations, snapshots |
| `/franchise/revenue` built | ✅ | Real data from `revenue_records` (existing RLS) |
| `/franchise/providers` built | ✅ | Real data via zip-overlap matching through service_areas |
| No new agents, handlers, or background services | ✅ | All data is read-only from tables already populated by existing automation |
| Build passes | ✅ | `npm run build` clean (lint warning pre-exists in unrelated file) |
| Typecheck passes | ✅ | Zero errors introduced by this batch |

## Status

**CERTIFIED ✅** — all four Franchise OS pages (`/franchise/dashboard`, `/franchise/territory`, `/franchise/revenue`, `/franchise/providers`) are real, tenant-scoped, evidence-grounded, and source exclusively from tables populated by the existing automation and agent infrastructure. No new customer-facing features, agents, dashboards beyond the Franchise OS scope, or frameworks were introduced.
