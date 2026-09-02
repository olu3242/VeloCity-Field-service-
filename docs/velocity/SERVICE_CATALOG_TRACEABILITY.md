# Service Catalog Traceability (Part B)

Every Service Catalog integration point, traced to real files/lines, with the exact fallback behavior when no catalog data exists for a given tenant/category/provider.

| Directive phase | Capability | Real source | Fallback when catalog data absent |
|---|---|---|---|
| B2/B3 | Canonical service hierarchy (Category → Service Type → Package) | `supabase/migrations/016_service_catalog.sql` — `service_types` (FK `category`), `service_packages` (FK `service_type_id`, `tier` check constraint) | A category with zero `service_types` rows behaves exactly as before (category-only) |
| B4 | Configurable package engine (Basic/Standard/Premium/Emergency/Commercial) | `service_packages.tier` check constraint in `016_service_catalog.sql`; seeded 5 tiers × 17 service types = 85 rows | No hardcoded package logic anywhere in app code — tiers are pure data |
| B5/B6 | Provider capability mapping (Provider → Skill → Certification → Eligible Service Types), dispatch integration | `provider_service_capabilities` table; consumed in `src/lib/providers/getAvailableProviders.ts` (serviceTypeId branch) | Providers with zero capability rows are unaffected — eligibility stays at the existing `categories[]` check (`getAvailableProviders.ts` comment + filter logic) |
| B7 | Pricing profile engine | `service_pricing_profiles` table; consumed in `src/app/api/quotes/route.ts` (`pricingProfileRow` query) → `src/lib/pricing/calculatePrice.ts` (`profile` branch) | No profile row for a category/tier → `calculatePrice` falls back to existing hardcoded `getBasePrice`/`calculateUrgencyAdjustment`/`calculateLocationAdjustment` path (unchanged code paths, confirmed in `calculatePrice.ts`) |
| B8 | Booking flow integration (Category → Service Type → Package) | `src/app/book/page.tsx` (`goToServiceTypeOrDetails`, conditional `serviceType` step); `GET /api/service-types` (`src/app/api/service-types/route.ts`); `bookingSchema` optional `service_type_id`/`service_package_id` (`src/lib/validation.ts`); `src/app/api/jobs/route.ts` insert payload | Empty `service_types` response for a category → booking UI skips straight from category step to details step, identical to pre-existing flow |
| B9 | Learning/skill integration extending LENA | `provider_service_capabilities.skill_level`/`is_certified`/`certification_expires_at` columns exist as the data surface LENA's existing skill-tracking automation handlers can read/write without a new schema; no new learning engine created | No capability rows → no behavior change to existing LENA flows |
| B10 | Revenue intelligence extending FINN | Command Center "Service Catalog Revenue Breakdown" section (`src/app/admin/command-center/page.tsx`) aggregates completed-job revenue by `service_type_id` in-memory, same pattern as every other Command Center metric; "Unclassified" row shows category-only adoption | Zero jobs with a `service_type_id` → breakdown table is empty, "Unclassified" row carries all completed revenue (no error, no new dashboard) |
| B11 | Command Center visibility | Same page/section as B10 — no new dashboard or route created | N/A |

## Backward compatibility proof points

- `bookingSchema.service_type_id`/`service_package_id` are `.optional().nullable()` — existing API callers that omit them are unaffected (`src/lib/validation.ts`).
- `jobs.service_type_id`/`service_package_id` are nullable FK columns added via `alter table ... add column if not exists` (`016_service_catalog.sql`) — no existing row or query is affected.
- `calculatePrice()` only branches when `input.pricingProfile` is truthy; with it `undefined` (true today in production until profiles are explicitly configured) every existing pricing test/behavior is identical.
- `getAvailableProviders()` only applies the capability filter when `input.job.service_type_id` is present AND the category-filtered provider set is non-empty; with no service type selected, behavior is byte-for-byte identical to before this batch.
