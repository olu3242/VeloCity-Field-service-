# Next Layer Growth Engine

## Architecture Summary

The growth layer extends the existing VeloCity MVP without replacing booking, dispatch, payments, or job workflow code. It adds deterministic engines for scoring, revenue optimization, prediction, retention, city expansion, franchise readiness, and growth automation routing.

## Files Created

- `src/lib/scoring/*`: trust, risk, confidence, fairness, territory, retention, and franchise scoring.
- `src/lib/revenue/*`: commission, diagnostic fee, surge pricing, subscriptions, provider plans, and revenue forecasts.
- `src/lib/prediction/*`: demand, supply, category trends, seasonal rules, and SLA forecasts.
- `src/lib/expansion/*`: city readiness, supply gaps, launch playbooks, and franchise territory models.
- `src/lib/retention/*`: rebooking windows, maintenance reminders, churn risk, loyalty, and membership recommendations.
- `src/lib/automation/growthEvents.ts`: growth event definitions and deterministic routing.
- `src/app/admin/growth/page.tsx`: admin growth intelligence dashboard.
- `src/components/admin/growth-charts.tsx`: revenue and demand charts.
- `supabase/migrations/004_growth_intelligence.sql`: franchise and territory intelligence tables.

## Scoring Formulas

All scores return:

```ts
{
  score: number,
  level: "low" | "medium" | "high" | "critical",
  reasons: string[],
  recommendations: string[]
}
```

Scoring is deterministic and uses weighted factors such as trust history, cancellation rate, quote variance, job urgency, payment failures, supply/demand balance, SLA performance, dispute rate, revenue, and operator readiness.

## Automation Events

- `high_demand_area_detected`
- `provider_shortage_detected`
- `surge_pricing_recommended`
- `recurring_service_opportunity_detected`
- `provider_subscription_opportunity_detected`
- `customer_churn_risk_detected`
- `territory_ready_for_expansion`
- `franchise_candidate_area_detected`

Events route to `ops_review` for high/critical severity and `growth_insights` otherwise.

## Dashboard Routes

- `/admin/growth`: growth command center with revenue, demand, supply gaps, expansion opportunities, risk, playbook, and recommendations.
- `/provider/dashboard`: enhanced with trust score, completion rate, on-time rate, quote fairness, earnings forecast, category expansion, provider plan recommendation, and coaching tips.

## QA Checklist

- Admin user can open `/admin/growth`.
- Non-admin users are redirected away from `/admin/growth`.
- Growth dashboard renders when Supabase returns empty arrays.
- Provider dashboard still shows offers and active jobs.
- Provider growth cards render for providers with no completed jobs.
- Revenue forecast handles zero historical revenue.
- Supply gap analysis handles zero providers.
- Scoring functions clamp all scores to `0-100`.
- Growth automation events include tenant ID and queue target.
- Migration `004_growth_intelligence.sql` applies after tenant migration.

## Remaining Blockers

- Linked Supabase project migration history is not aligned with the local repo.
- Growth tables cannot be verified remotely until migrations are reconciled.
- AI-enhanced variants can be layered later; current engines are deterministic fallbacks.
- Map-based franchise visualization is represented as a readiness table until map assets/providers are finalized.
