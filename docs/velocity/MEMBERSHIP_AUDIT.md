# Membership Audit (Batch X+2, Phase 1)

Per Rule 1 ("extend existing systems only"), this audit inventories every piece of recurring-revenue, scheduling, and revenue infrastructure that already exists before any new schema or code is written, and identifies the exact gaps the Membership Engine must fill.

## 1. Existing recurring capability

| Component | Location | Status |
|---|---|---|
| `subscriptions` table | `supabase/migrations/001_initial_schema.sql:335-349` | **Schema-only, dead.** Columns: `id, tenant_id, customer_id, provider_id, stripe_subscription_id, stripe_price_id, category, plan_name, interval ('weekly'\|'monthly'\|'quarterly'), amount_cents, status, next_service_date, created_at, updated_at`. Zero `.from("subscriptions")` calls anywhere in `src/`. No app code reads, writes, or schedules against it. |
| `Subscription` TS interface | `src/types/index.ts:339-354` | Mirrors the table; never instantiated. |
| `subscription_events` table | written by `src/app/api/webhooks/stripe/route.ts:292-315` | **Live, but metadata-only.** Logs `invoice.payment_succeeded`/`invoice.payment_failed` (`stripe_invoice_id`, `amount_paid`/`amount_due`) and emits generic `payment_authorized`/`payment_failed` automation events. Does not create, renew, or track a subscription lifecycle, and does not reference the `subscriptions` table above. |
| `recommendCustomerSubscription()` | `src/lib/revenue/subscriptionRecommendations.ts:17` | In-memory, static category→plan suggestion (no persistence, no billing). |
| `recommendMembership()` | `src/lib/retention/membershipRecommendation.ts:4` | The only existing "membership" concept in the codebase — a thin relabeling wrapper around `recommendCustomerSubscription()`. Not persisted, not tied to any entitlement or billing record. |
| LENA `subscription_recommendation` field | `src/lib/agents/lena.ts:40-45` (used by `recommendRebook()`) | LLM output field only (`plan_name/interval/description/estimated_savings_percent`) — advisory text, not a write path. |

**Conclusion**: there is no persistent, billed, lifecycle-tracked recurring-revenue concept anywhere in the platform today. The dead `subscriptions` table is the closest prior art and is the natural extension point per the directive's "if equivalent structures already exist, extend them, do not replace" — its column shape (customer/provider/category/plan_name/interval/amount_cents/status/next_service_date) is reused almost verbatim as the basis for `membership_subscriptions` rather than being discarded.

## 2. Existing scheduling capability

| Component | Location | Status |
|---|---|---|
| `provider_availability` | `supabase/migrations/008_real_world_ops.sql:43-54` | Static weekly recurring window (`day_of_week`, `start_time`, `end_time`, `is_active`). No link to any recurring job or subscription. |
| `provider_settings` | `supabase/migrations/008_real_world_ops.sql:56-66` | `service_radius_km`, `max_jobs_per_day` — dispatch capacity limits, not schedule generation. |
| Cron jobs | `src/app/api/cron/*` (automation, daily, payouts, sla, daily-intelligence) | None create jobs from a subscription, none read `next_service_date`, none generate recurring bookings. |

**Conclusion**: there is no recurring-job scheduler anywhere in the platform. Membership Engine Phase 9 must design this from scratch, but it can and must read `provider_availability`/`provider_settings` rather than introducing a parallel capacity model.

## 3. Existing revenue capability

| Component | Location | Computes |
|---|---|---|
| `calculateCommission()` | `src/lib/revenue/commissionEngine.ts:18` | Per-job commission rate, platform fee, provider payout. |
| `forecastRevenue()` | `src/lib/revenue/revenueForecast.ts:19` | Single-shot territory/category revenue projection from historical revenue + job count + growth rate. |
| `recommendProviderPlan()` | `src/lib/revenue/providerPlanRecommendations.ts:7` | Provider-side tier suggestion (starter/growth/pro) from job count/trust/revenue — unrelated to customer memberships. |
| Surge pricing | `src/lib/revenue/surgePricing.ts` | Demand-based price multiplier, per-job only. |
| `revenue_records` table | `supabase/migrations/20260530000001_revenue_records.sql` | **Live** — canonical per-payment revenue attribution (`gross_amount_cents`, `platform_fee_cents`, `provider_payout_cents`, `franchise_royalty_cents`), linked to `job_id`/`payment_id`/`franchise_territory_id`. This is the real-money ledger that recurring revenue metrics must read from. |
| `calculateRetentionProbabilityScore()` | `src/lib/scoring/retentionScore.ts:8` | Accepts a caller-supplied `hasSubscription?: boolean` flag (never DB-derived) and recommends "Offer membership if customer has repeated bookings" as a string — advisory only. |

**Conclusion**: no MRR, ARR, renewal rate, churn rate, or membership profitability metric exists anywhere. `revenue_records` is the correct real-data foundation for these — every membership-driven dollar must ultimately be a row there, joined through a new `membership_subscription_id` reference, so recurring-revenue metrics are computed from the same ledger as all other platform revenue rather than a second accounting system.

## 4. Automation infrastructure

| Component | Location | Status |
|---|---|---|
| `AutomationEventType` | `src/types/automation.ts:3-32` | Includes `subscription_due` and `warranty_callback_due`. |
| Router | `src/lib/automation/router.ts:163-172` | Has switch-case branches for both event types above, but **neither is ever emitted** by any code path in `src/` — confirmed dead automation hooks. |
| `GrowthAutomationEventName` | `src/lib/automation/growthEvents.ts:5-6` | `recurring_service_opportunity_detected`, `provider_subscription_opportunity_detected` — one-way detection signals only, no lifecycle orchestration. |

**Conclusion**: `subscription_due` is the pre-existing, never-fired analog of the directive's `service.due` event. Rather than adding a second dead event next to it, Phase 8 activates `subscription_due` as the literal emission point for membership-driven service-due automation, and adds the remaining new event types (`membership_created`, `membership_renewed`, `membership_expiring`, `membership_cancelled`, `renewal_failed`) as snake_case additions to the same `AutomationEventType` union, routed through the existing router — no second automation engine.

## 5. Agent intelligence surfaces (extension points, not yet built)

| Agent | File | Current methods | Membership-relevant gap |
|---|---|---|---|
| LENA | `src/lib/agents/lena.ts` | `recommendRebook()`, `assessChurnRisk()`, `recommendGrowthPath()` (Batch X+1) | No membership read path. |
| ALICE | `src/lib/agents/alice.ts:1-102` | `classify()` only — intake classification | Zero retention/membership logic; Phase 7 is entirely new methods. |
| NOVA | `src/lib/agents/nova.ts` | `analyzeTransition()` only — job state-transition validation | Zero cross-sell/upsell logic; Phase 6 is entirely new methods. |
| FINN | `src/lib/agents/finn.ts` | `evaluatePayout()`, `reconcile()`, `estimateJobEconomics()` (Batch X+1) | Zero MRR/ARR/churn-rate logic; Phase 5 is entirely new methods. |

## 6. Service Catalog (entitlement basis for Phase 4)

`service_types` and `service_packages` (`supabase/migrations/016_service_catalog.sql`) already provide the Category → Service Type → Package hierarchy the directive requires membership entitlements to derive from. `service_packages.tier` already includes a `'commercial'` tier usable by the Commercial Maintenance plan. No new catalog concepts are needed — entitlements reference existing `service_types.id`/`service_packages.id` rows directly.

## 7. Membership gaps (summary)

1. No persistent membership/subscription model — the only candidate (`subscriptions`) is dead schema with no lifecycle code.
2. No recurring job scheduler — `provider_availability`/`provider_settings` exist but generate nothing.
3. No MRR/ARR/churn/renewal-rate computation anywhere.
4. No membership-aware automation events fire today (`subscription_due` exists but is never emitted).
5. No retention intelligence beyond per-call, non-persisted scoring functions (`calculateChurnRisk`, `scoreEngagement`, `predictChurn`) — none are wired to a membership concept.
6. No customer-facing membership UI of any kind.
7. No provider-facing recurring-work visibility.

These seven gaps map directly to Phases 2–11 of this batch.
