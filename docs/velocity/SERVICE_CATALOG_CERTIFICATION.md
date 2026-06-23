# Service Catalog Certification (Part B)

| Acceptance criterion (from directive) | Status | Evidence |
|---|---|---|
| Canonical service model created, additive only | ✅ | `supabase/migrations/016_service_catalog.sql` — no `drop`/`alter ... type`/enum changes; validated idempotent against a local Postgres scratch DB (applied twice, second run produced zero inserts and "already exists" notices for every object) |
| Service hierarchy resolves Category → Service Type → Package with no hardcoded mappings | ✅ | `service_types.category` FK to existing enum; `service_packages.service_type_id` FK; both pure data, zero category/type/tier switch statements added to app code |
| Configurable package engine (Basic/Standard/Premium/Emergency/Commercial) | ✅ | `service_packages.tier` check constraint; 85 seeded rows (17 service types × 5 tiers); no hardcoded package logic in app code |
| Dispatch integration extends existing system, reuses MAX, no new dispatch engine | ✅ | `getAvailableProviders.ts` gained one additive filter branch; `max.match()` untouched; `src/app/api/admin/dispatch/route.ts` call site unchanged |
| Provider capability mapping (Provider → Skill → Certification → Eligible Service Types) | ✅ | `provider_service_capabilities` table + RLS policies in `016_service_catalog.sql`; consumed by dispatch eligibility filter |
| Pricing profile engine extends existing pricing infra, reuses FINN, no duplicate pricing engine | ✅ | `service_pricing_profiles` table; `calculatePrice()` gained one additive branch; all existing pricing functions (`urgencyPricing`, `locationPricing`, `complexityPricing`, `surgePricing`, `diagnosticPricing`) untouched and still the default path |
| Booking flow integration, backward compatible | ✅ | `src/app/book/page.tsx` optional `serviceType` step; existing category-only flow is the unconditional fallback when no service types are configured for a category |
| Command Center visibility, no new dashboard | ✅ | New section added to the existing `/admin/command-center` page; no new route/page created |
| Build/lint/typecheck pass after all changes | ✅ | `npx tsc --noEmit` clean; `npm run lint` clean (only a pre-existing unrelated `<img>` warning); `npm run build` succeeds, including new `/api/service-types` route and updated `/book` page |

## Certification

All Part B acceptance criteria are met. The Service Catalog Engine is now a real, additive source of truth wired into booking, dispatch eligibility, pricing, and Command Center revenue reporting, with every integration point falling back to pre-existing behavior when catalog data is absent for a given tenant/category/provider.

**Status: CERTIFIED ✅**
