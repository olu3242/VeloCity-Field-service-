# Commercial Account Certification (Batch X+3, Phase 13)

| Criterion | Status | Evidence |
|---|---|---|
| Supersedes dead `enterprise-contracts/` code rather than extending unreachable code | ✅ | `EXPANSION_AUDIT.md` §3 confirms `src/lib/enterprise-contracts/` has zero importers anywhere in `src/` and is in-memory-only; the new `commercial_contracts`/`commercial_service_plans` tables are modeled on its type shapes but are the only persisted, reachable commercial-contract model |
| Multi-location accounts | ✅ | `commercial_locations.account_id` is not unique (one account, many rows), mirroring the already-multi-location-capable `customer_addresses` table per `EXPANSION_AUDIT.md` §3 |
| Multi-contact accounts | ✅ | `commercial_contacts.account_id` is not unique; `profile_id` optionally links a contact to an existing `profiles` row without requiring one |
| Contracts (SLA / volume commitment / custom terms / franchise) | ✅ | `commercial_contracts.contract_type` check constraint covers all four types from the directive |
| Service Plans derived from Service Catalog | ✅ | `commercial_service_plans.service_type_id` references `service_types(id)` and `service_package_id` references `service_packages(id)` directly — same Service-Catalog-driven entitlement pattern as `membership_entitlements` (Batch X+2), no hardcoded benefits |
| Single write path | ✅ | `src/lib/commercial/commercialAccountLifecycle.ts` is the only file that inserts/updates `commercial_accounts`/`commercial_locations`/`commercial_contracts`/`commercial_service_plans`/`commercial_contacts`, traced exhaustively in `EXPANSION_INTELLIGENCE_E2E_VALIDATION.md` |
| Account summary surfaced read-time | ✅ | `computeCommercialAccountSummary()` (`src/lib/commercial/commercialAccountSummary.ts`) reads locations/contracts/service plans/revenue with zero new write paths, consumed by both Command Center and the customer dashboard |
| RLS enforced, tenant-scoped, contact-scoped | ✅ | All 5 commercial tables have `tenant_id` and admin-management policies; `commercial_accounts`/`commercial_locations`/`commercial_contracts`/`commercial_service_plans`/`commercial_contacts` each additionally grant `select` to the account's `primary_contact_id` |
| Migration idempotent | ✅ | Dual-apply test against local Postgres stub: zero errors on either pass |
| Build/lint/typecheck pass | ✅ | `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean |

**Status: CERTIFIED ✅** — The Commercial Account model is a Service-Catalog-driven, single-write-path extension that supersedes the dead, unreachable `enterprise-contracts/` module rather than duplicating it, with full multi-location/multi-contact support reusing the existing address-modeling pattern.
