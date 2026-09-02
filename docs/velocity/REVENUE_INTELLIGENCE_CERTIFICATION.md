# Revenue Intelligence Certification (Platform Certification Batch, Phase 5)

| Criterion | Status | Evidence |
|---|---|---|
| Core revenue | ✅ | `revenue_records` is the single ledger read by every revenue computation in the platform (membership, commercial, and base job revenue alike) — confirmed by `COMMERCIAL_REVENUE_CERTIFICATION.md` and `RECURRING_REVENUE_CERTIFICATION.md` |
| Membership revenue | ✅ | `computeRecurringRevenueIntelligence()` (`src/lib/membership/membershipRevenueIntelligence.ts:33-90`) computes MRR/ARR/renewal-rate/churn-rate from real `revenue_records` rows filtered by `membership_subscription_id` |
| Commercial revenue | ✅ | `computeCommercialRevenueIntelligence()` (`src/lib/commercial/commercialRevenueIntelligence.ts`) computes contract attainment, at-risk contracts, renewal pipeline from `commercial_contracts` joined to `revenue_records` |
| Forecasting | ✅ | `forecastRevenue()` (`src/lib/revenue/revenueForecast.ts:19`) — deterministic forecast function; consumed by Command Center/admin reporting surfaces, not a separate forecasting engine |
| Commission tracking | ✅ | `calculateCommission()` (`src/lib/revenue/commissionEngine.ts:18`) — category-based commission calculation; `revenueHealthScore.ts` derives take-rate (`commissionRevenueCents / gmvCents`) from the same metrics object used across Command Center |
| Payout tracking | ✅ | `writePayoutLedger()` (`src/lib/payments/payoutLedger.ts:4`) is the payout ledger write path, paired with `releasePayout.ts`/`holdPayout.ts` and `src/lib/treasury/payout-orchestrator.ts` + `treasury-ledger.ts` for Stripe-side reconciliation; `payout_queue` table tracked through the 3-attempt retry path in `payout-release.ts` and the hourly `/api/cron/payouts` cron |
| Pricing intelligence | ✅ (supporting, not a separate revenue system) | `pricingRules.ts`/`surgePricing.ts`/`providerPlanRecommendations.ts`/`subscriptionRecommendations.ts` all feed the same commission/revenue pipeline rather than maintaining parallel numbers |
| No duplicate revenue ledger | ✅ | Confirmed across all of the above — membership and commercial revenue intelligence are read-time aggregations over `revenue_records`, not separate ledgers (per `COMMERCIAL_REVENUE_CERTIFICATION.md` criterion 1 and `RECURRING_REVENUE_CERTIFICATION.md`) |

**Status: CERTIFIED ✅** — every revenue-adjacent number in the platform (commission, payout, forecast, membership MRR/ARR, commercial attainment) traces back to `revenue_records`/`payments`/`payout_queue`, with zero parallel ledgers introduced across any batch to date.
