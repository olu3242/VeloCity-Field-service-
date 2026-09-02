# Skills Graph Audit (Batch X+1, Phase 1)

Read-only audit of every signal that could derive a provider's measurable skill, per Rule 2 ("all intelligence must derive from real data"). No schema or code changed in this document.

## 1. Provider base signals (`providers` table, migration 001)

| Column | Type | Granularity | Status |
|---|---|---|---|
| `categories` | `service_category[]` | category-wide | Live, used by dispatch |
| `years_experience` | integer | provider-wide | Live, unused for skills |
| `completed_jobs` | integer | provider-wide | Live, unused per-service-type |
| `trust_score` | numeric(3,2) | provider-wide | Live, computed by `update_provider_trust_score()` (migration 001:508-532) |
| `cancellation_rate` | numeric(4,3) | provider-wide | Live, unused per-service-type |
| `response_time_minutes` | integer | provider-wide | Live, unused per-service-type |
| `documents` (jsonb) | `ProviderDocument[]` | provider-wide | `type: "certification"` field already exists in `src/types/index.ts:141`, unused downstream |

## 2. Service Catalog signals (migration `016_service_catalog.sql`)

**`provider_service_capabilities`** (016:52-63) is the existing skill table:
- `skill_level text default 'qualified' check in ('trainee','qualified','expert')`
- `is_certified boolean default false`
- `certification_expires_at timestamptz`
- Unique on `(provider_id, service_type_id)`

This is the foundation for the Skills Graph — it already exists and is already populated by providers' capability rows, but `skill_level`/`is_certified`/`certification_expires_at` are **read by nothing**: `src/lib/providers/getAvailableProviders.ts:28-44` only checks for row *existence* (capability match), never reads these three columns, and `src/lib/agents/max.ts` ranking prompt never receives them.

`jobs.service_type_id`/`jobs.service_package_id` (016:101-102) make every job traceable to a granular service type — this is what makes per-skill evidence possible at all.

## 3. Job history signals

`jobs` (status, category, service_type_id, provider_id, final_cost_cents) + `job_status_history` (every transition, actor, reason) together make "provider X completed N jobs of service_type Y" a queryable fact (`jobs.provider_id = X and jobs.service_type_id = Y and jobs.status in ('completed','closed','customer_confirmed')`), not yet computed anywhere in code.

## 4. Review/rating signals

`reviews` (migration 001:279-289): `rating` (1-5), `comment`, `job_id`. Current aggregation (`update_provider_trust_score()`, `velocity_provider_formula_view` migration 009:294) is **always provider-wide** — `avg(rating) where reviewee_id = provider.user_id`, with no join through `jobs.service_type_id`. No service-type-specific rating aggregation exists anywhere in the codebase today.

## 5. Dispatch/offer signals

`provider_offers` (migration 001:317-329): `match_score`, `accepted_at`, `rejected_at`, `rejection_reason`, joined to `jobs` (hence service_type_id). `getAvailableProviders.ts` already queries `provider_service_capabilities` for category-aware filtering (Part B of the prior batch) but, as above, ignores skill_level/certification. MAX's ranking prompt (`src/lib/agents/max.ts:29-34`) documents "category match (20%)" but receives only the raw `categories` array, not skill level.

## 6. Existing certification/tier concepts

Only `provider_service_capabilities.skill_level`/`is_certified`/`certification_expires_at` are live schema. `src/lib/analytics/provider-analytics.ts:19`'s `tier: "top"|"standard"|"at_risk"|"suspended"` is in-memory only, not persisted, not derived from skills. No "bronze/silver/gold/elite" string exists anywhere in the repo today (confirmed via full-repo grep) — Phase 3's certification tiers are new vocabulary, not a rename of something existing.

## 7. Trust score computation (three separate, unreconciled systems)

1. **DB function** `update_provider_trust_score()` (migration 001:508-532): `(avg_rating/5*0.6) + (completion_rate*0.4)`, provider-wide.
2. **App layer** `src/lib/scoring/providerTrustScore.ts:12-34`: six-input weighted composite (trust, completion, rating, cancellation, response, approval), provider-wide.
3. **In-memory** `src/lib/trust/provider-trust.ts`: signal-weighted `clamp(50 + weightSum, 0, 100)`, not persisted.

None of the three are service-type-specific. This is the single biggest gap for skill-level proficiency scoring — it must be derived fresh via `reviews → jobs → service_type_id` joins, not reused from any of the three existing trust formulas (which stay provider-wide and untouched).

## Skill derivation strategy (for Phase 2)

A provider's proficiency in a given service type will be computed — never hardcoded — from:
1. **Completed job count** for that `service_type_id` (from `jobs`)
2. **Average rating** for that `service_type_id` (from `reviews` joined through `jobs.service_type_id`)
3. **Existing capability row** (`skill_level`, `is_certified`, `certification_expires_at`) as a provider-asserted starting signal, not a substitute for evidence
4. **Cancellation/rejection rate** for that service type (from `provider_offers` joined through `jobs.service_type_id`)

This keeps the existing `provider_service_capabilities` table as the live anchor (extended, not replaced) and adds two new evidence tables (`provider_skill_evidence`, `provider_skill_progress`) to store the computed, traceable proficiency — never a manually-assigned score.

## Conclusion

The schema is roughly 60% ready: `provider_service_capabilities` already encodes a skill concept, and `jobs.service_type_id` already makes per-type evidence queryable. What's missing is (a) the computation that turns job/review/offer history into a per-skill score, (b) a table to persist that computed score with its evidence trail, and (c) wiring that score into dispatch (`getAvailableProviders.ts`/`max.ts`) and LENA/QUINN. All of Phase 2 onward builds strictly on top of this existing schema.
