# Certification Engine Certification (Batch X+1, Phase 12)

| Criterion | Status | Evidence |
|---|---|---|
| Bronze/Silver/Gold/Elite tiers are new schema, not a rename | ✅ | Confirmed via repo-wide grep (`SKILLS_GRAPH_AUDIT.md` §6) that no tier vocabulary existed before migration 017 |
| Requirements are admin-configurable, not hardcoded in app code | ✅ | `provider_certification_requirements` table, seeded with illustrative starting thresholds per category × tier, editable via the existing admin-write RLS policy |
| Certifications computed, never manually assigned | ✅ | `evaluateProviderCertification()` (`src/lib/certifications/evaluateCertifications.ts`) evaluates `providers.trust_score`/`cancellation_rate` + real completed-job/review counts against `provider_certification_requirements`; no code path inserts a `provider_certifications` row outside this function |
| Tier evaluated ascending, highest passing tier awarded | ✅ | Loop over `bronze → silver → gold → elite`, only overwriting `awardedTier` when all four thresholds (jobs, rating, trust, cancellation) pass |
| Revocation on regression | ✅ | If no tier passes and an active certification exists, it is deactivated (`is_active: false`, `revoked_at` set) rather than left stale |
| Every award/revocation has an evidence trail | ✅ | `provider_certification_evidence` insert per evaluated metric (`metric`, `value`, `threshold`, `passed`) for every tier checked, not just the awarded one |
| Wired into dispatch eligibility | ✅ | `getAvailableProviders.ts` requires an active Gold/Elite certification in the job's category for `service_packages.tier === 'commercial'` jobs (Phase 7) |
| Migration idempotent, build/lint/typecheck pass | ✅ | See `PROVIDER_EXCELLENCE_E2E_VALIDATION.md` |

**Status: CERTIFIED ✅** — certification tiers are computed exclusively from real provider metrics against admin-configured thresholds, with a full evidence trail behind every award and revocation.
