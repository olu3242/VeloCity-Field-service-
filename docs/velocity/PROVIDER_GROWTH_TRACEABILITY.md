# Provider Growth Traceability (Batch X+1, Phase 12)

Traces every figure surfaced by Provider Growth Intelligence back to its real-data source, per Rule 2.

| Output | Source | Computation |
|---|---|---|
| Revenue Opportunities (`revenueOpportunities`) | `jobs.final_cost_cents`, `jobs.created_at`, `jobs.category` | Sum of completed-job revenue per category, current 60-day window vs prior 60-day window; `trend` is a >10% delta comparison |
| Pricing Opportunities (`pricingOpportunities`) | `jobs.final_cost_cents` for this provider vs platform-wide, same category, same 120-day window | `variancePercent = (providerAvg - platformAvg) / platformAvg`; surfaced only when `|variancePercent| >= 10` |
| Service Expansion Opportunities (`serviceExpansionOpportunities`) | `LenaAgent.recommendGrowthPath()` → `jobs.category` counts over the last 90 days, excluded if already in `providers.categories` | Reused, not recomputed, from LENA's growth path (Rule "no duplicate systems") |
| Geographic Expansion Opportunities (`geographicExpansionOpportunities`) | `jobs.zip` for the provider's existing categories, last 90 days, excluded if already in `providers.service_area_ids` | Top 10 zips by job count outside the provider's current service area |
| Expected Revenue Impact (`expectedRevenueImpactCents`) | Sum of (a) the dollar gap between provider and platform average price for under-priced categories, and (b) platform average job price × missed-demand job count per expansion category | Both halves use real platform `jobs.final_cost_cents` averages — no flat/synthetic per-job dollar constant |

## Upstream dependency chain

```
jobs / reviews / provider_offers
        ↓ (Phase 2/3)
provider_skills, provider_skill_progress, provider_certifications
        ↓ (Phase 4)
LenaAgent.recommendGrowthPath()
        ↓ (Phase 8, reused not duplicated)
computeProviderGrowthIntelligence()
        ↓ (Phase 9/10)
Command Center "Provider Excellence Intelligence" + Provider Dashboard "Provider Excellence"
```

Every node in this chain reads from the node above it; no node fabricates a value independently.
