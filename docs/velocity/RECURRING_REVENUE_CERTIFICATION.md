# Recurring Revenue Certification (Batch X+2, Phase 13)

| Criterion | Status | Evidence |
|---|---|---|
| Extends FINN, no parallel revenue engine | ✅ | `FinnAgent.calculateRecurringRevenue()` (`src/lib/agents/finn.ts`) delegates directly to `computeRecurringRevenueIntelligence()`; no new agent class, no new revenue ledger — reads `revenue_records` and `membership_subscriptions` |
| MRR | ✅ | `mrrCents` sums every active subscription's `amount_cents × MONTHLY_EQUIVALENT[billing_frequency]` (`src/lib/membership/membershipRevenueIntelligence.ts`) |
| ARR | ✅ | `arrCents = mrrCents × 12` |
| Renewal Rate | ✅ | Computed from `membership_events` over a 90-day window: `membership_renewed` count ÷ (`membership_renewed` + `membership_cancelled` + `renewal_failed`) count |
| Churn Rate | ✅ | `1 - renewalRate` over the same 90-day `membership_events` window |
| Expansion Revenue | ✅ | `expansionRevenueCents` sums, per active subscription, the positive difference between `amount_cents` and the plan's lowest baseline price at the same billing frequency (`membership_plan_pricing`) |
| Membership Profitability | ✅ | `planProfitability` joins `revenue_records.provider_payout_cents` filtered by `membership_subscription_id`, grouped by plan, against plan revenue — no synthetic margin |
| Forecasted Revenue | ✅ | `forecastedNextPeriodRevenueCents` projects MRR forward using the same renewal-rate-derived retention factor computed above, no separate forecasting model introduced |
| Revenue chain integrity | ✅ | Every dollar in this report is reachable from a real `membership_subscriptions`/`revenue_records` row; no hardcoded or fabricated figures |
| Build/lint/typecheck pass | ✅ | `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean |

**Status: CERTIFIED ✅** — Recurring Revenue Intelligence is a read-time computation layered onto FINN, deriving every metric (MRR, ARR, Renewal Rate, Churn Rate, Expansion Revenue, Profitability, Forecast) from real subscription and revenue-record data with zero new write paths.
