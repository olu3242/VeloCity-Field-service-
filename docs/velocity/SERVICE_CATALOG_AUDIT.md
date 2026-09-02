# Service Catalog Audit (Part B1)

Audit of the pre-existing service model, performed before any new schema was written, to confirm the Service Catalog Engine extends real structures rather than duplicating or replacing them.

## 1. What already existed (source of truth before this batch)

| Concern | Real source | Notes |
|---|---|---|
| Category taxonomy | `supabase/migrations/001_initial_schema.sql` — `service_category` Postgres enum (18 values: plumbing, electrical, hvac, cleaning, landscaping, pest_control, appliance_repair, locksmith, handyman, painting, roofing, flooring, carpentry, moving, pool_service, garage_door, windows, other) | Used directly on `jobs.category` (required, not nullable) |
| Provider eligibility | `providers.categories` (GIN-indexed array column) | Checked via `.contains("categories", [category])` in `src/lib/providers/getAvailableProviders.ts:17` |
| Pricing | `src/lib/pricing/{calculatePrice,pricingRules,urgencyPricing,locationPricing,complexityPricing,surgePricing,diagnosticPricing}.ts` | Pure functions keyed by `ServiceCategory`, hardcoded `CATEGORY_BASE_PRICE_CENTS` table, no DB-driven pricing input |
| Dispatch ranking | `src/lib/agents/max.ts` `match()` | Ranks providers already filtered to the right category by trust score, proximity, availability, response rate — no sub-category or skill-tier concept |
| Booking flow | `src/app/book/page.tsx`, `src/app/api/jobs/route.ts`, `bookingSchema` in `src/lib/validation.ts` | Customer picks one of the 18 categories only; no sub-categorization or package step existed |
| Validation | `serviceCategorySchema` (`z.enum([...18 values])`) in `src/lib/validation.ts:3-22` | Single flat enum, no hierarchy |

## 2. Gaps confirmed (justifying additive Part B work)

1. **No sub-categorization layer.** A category like `plumbing` had no concept of "Leak Repair" vs. "Drain Cleaning" vs. "Water Heater Service" — everything inside a category was undifferentiated.
2. **No package/tier concept.** Basic/Standard/Premium/Emergency/Commercial tiers, as required by the directive, did not exist anywhere in schema or pricing.
3. **No provider skill/certification mapping below the category level.** A provider was either in a category's array or not — no skill level, certification, or expiry tracking per sub-service.
4. **Pricing was 100% hardcoded by category**, with no per-tenant, per-category, per-tier override mechanism.
5. **Dispatch had no way to prefer/require a provider qualified for a specific service type** beyond blanket category membership.

## 3. What the Service Catalog Engine adds (and what it deliberately does not touch)

- Adds 4 new additive tables (`service_types`, `service_packages`, `provider_service_capabilities`, `service_pricing_profiles`) and 2 nullable FK columns on `jobs` (`service_type_id`, `service_package_id`) — see `supabase/migrations/016_service_catalog.sql`.
- Does **not** alter, drop, or replace `service_category` enum, `providers.categories[]`, `jobs.category`, the existing pricing functions, or `max.match()`'s ranking algorithm.
- Every new field is optional/nullable; every new table's absence of rows for a given tenant/category/provider falls back to the pre-existing behavior (category-only booking, hardcoded pricing, category-only dispatch eligibility). This is verified in code at each integration point (see `SERVICE_CATALOG_TRACEABILITY.md`).

## 4. Conclusion

The audit confirms category-level data already existed and was real/used; the gap was strictly the missing sub-categorization, package, capability, and pricing-profile layer. Part B's migration and integration points close that gap without creating a second source of truth.
