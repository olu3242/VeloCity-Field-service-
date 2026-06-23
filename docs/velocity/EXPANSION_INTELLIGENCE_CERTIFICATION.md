# Expansion Intelligence Certification (Batch X+3, Phase 13)

| Criterion | Status | Evidence |
|---|---|---|
| Extends the existing region concept, no parallel market_regions table | ✅ | `market_metrics`/`market_supply`/`market_demand`/`market_opportunities` all key off `franchise_territories(id)` (migration 004), per `EXPANSION_AUDIT.md` §1 — no new region primitive introduced |
| NOVA Demand Intelligence | ✅ | `NovaAgent.assessMarketDemand()` (`src/lib/agents/nova.ts`) delegates to `computeMarketDemand()`, computing per-category `expected_jobs`/`actual_jobs`/`demand_growth_rate` from real `jobs` rows matched by zip |
| Supply Intelligence | ✅ | `NovaAgent.assessMarketSupply()` delegates to `computeMarketSupply()`, computing per-category `active_providers`/`avg_response_minutes`/`capacity_utilization` from real `providers`/`service_areas` rows |
| Expansion opportunities with expected revenue impact | ✅ | `NovaAgent.recommendExpansionOpportunities()` delegates to `computeMarketOpportunities()`, which reuses the existing `calculateTerritoryOpportunityScore()`/`analyzeSupplyGap()` pure functions against real demand/supply data and persists `market_opportunities` rows with `expected_revenue_impact_cents` |
| Dead `territory_scorecards`/`franchise_territories` columns activated, not duplicated | ✅ | `demand_index`/`supply_index` are computed from real data and persisted into the new `market_metrics` table per territory per day, rather than a second metrics table being added |
| Single write path for market tables | ✅ | `marketDemandIntelligence.ts`/`marketSupplyIntelligence.ts`/`marketOpportunityIntelligence.ts` are the only files that write `market_demand`/`market_supply`/`market_metrics`/`market_opportunities`, all invoked only from NOVA's new methods |
| Migration idempotent | ✅ | Dual-apply test against local Postgres stub: first apply clean, second apply "already exists, skipping" for every statement |
| Build/lint/typecheck pass | ✅ | `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean |

**Status: CERTIFIED ✅** — Expansion Intelligence extends the existing `franchise_territories` region model with real demand/supply computation and opportunity scoring, reusing the pre-existing pure scoring functions in `src/lib/expansion/` rather than introducing a parallel market-intelligence system.
