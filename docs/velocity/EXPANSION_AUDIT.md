# Expansion Audit (Batch X+3, Phase 1)

Per Rule 1 ("extend existing systems only"), this audit inventories every piece of market-expansion, commercial-account, and dispatch infrastructure that already exists before any new schema or code is written, and identifies the exact gaps Expansion Intelligence + Commercial Accounts must fill.

## 1. Existing market/territory intelligence

| Component | Location | Status |
|---|---|---|
| `service_areas` table | `supabase/migrations/001_initial_schema.sql:92-100`, tenant-scoped in `003_*.sql` | **Live, read-only.** `id, name, city, state, zip_codes[], is_active, tenant_id`. Read by `admin/growth/page.tsx`, `admin/command-center/page.tsx`, `api/cron/daily-intelligence/route.ts`, `lib/geo/validateServiceArea.ts`. No app code writes to it after seeding. |
| `franchise_territories` table | `supabase/migrations/004_growth_intelligence.sql:3-13` | **Live.** `id, tenant_id, name, city, state, zip_codes[], status ('evaluating'|...), created_at, updated_at`. Has 4 dependent tables: `territory_operators`, `territory_scorecards` (demand_index, supply_index, provider_count, active_customers, jobs_completed, revenue_cents, dispute_rate, sla_hit_rate, readiness_score), `expansion_recommendations`, `local_market_snapshots`. Read by `franchise/dashboard/page.tsx`. |
| `market_regions`/`market_metrics`/`market_supply`/`market_demand`/`market_opportunities` | — | **Do not exist.** Zero matches anywhere in migrations or `src/`. |
| `src/lib/expansion/*.ts` (6 files: `territoryOpportunityScore.ts`, `cityReadinessScore.ts`, `franchiseTerritoryModel.ts`, `supplyGapAnalysis.ts`, `launchPlaybookGenerator.ts`, `index.ts`) | `src/lib/expansion/` | **Pure functions, zero DB access.** Take caller-supplied numbers (`demandIndex`, `providerGap`, `medianIncomeIndex`, `competitionIndex`, `providerCount`, `activeCustomers`, `monthlyRevenueCents`, `expectedJobs`, `activeProviders`) and return a score/checklist. None of them read `franchise_territories`, `territory_scorecards`, or any other table — every call site (`admin/growth/page.tsx`, `admin/command-center/page.tsx`, `provider/dashboard/page.tsx`) must already have fetched the inputs from elsewhere. |

**Conclusion**: `franchise_territories` + its 4 scorecard/operator/recommendation/snapshot tables are the correct, already-live "market region" concept — there is no need for a parallel `market_regions` table. The Expansion Intelligence Phase 2 schema must extend `franchise_territories` (new `market_metrics`/`market_supply`/`market_demand`/`market_opportunities` tables keyed by `territory_id`, not a new region primitive) and wire the existing pure-function scorers in `src/lib/expansion/` to read real `territory_scorecards`/`jobs`/`providers` data instead of relying on callers to supply numbers ad hoc.

## 2. Existing supply/demand intelligence

| Component | Location | Status |
|---|---|---|
| `supplyGapAnalysis.ts` | `src/lib/expansion/supplyGapAnalysis.ts` | Pure: `providersNeeded = max(0, ceil(expectedJobs/8) - activeProviders)`, severity high/medium/low. No DB read of real job/provider counts per category/territory. |
| `territory_scorecards.supply_index`/`demand_index` | `franchise_territories` migration | Columns exist; nothing computes or writes them today — confirmed dead columns, same pattern as the Batch X+2 `subscriptions` table. |
| NOVA | `src/lib/agents/nova.ts` | `analyzeTransition()` (job state-transition validation) + `recommendMembershipGrowth()` (Batch X+2). Zero demand/supply intelligence methods. |

**Conclusion**: NOVA Demand Intelligence (Phase 3) and Supply Intelligence (Phase 4) are entirely new methods on the existing `NovaAgent` class, computing `territory_scorecards.demand_index`/`supply_index` from real `jobs`/`providers` rows — the same "activate dead columns with real computation" pattern used for `subscription_due` in Batch X+2.

## 3. Existing commercial-account infrastructure

| Component | Location | Status |
|---|---|---|
| `src/lib/enterprise-contracts/` (4 files: `contract-registry.ts`, `sla-contract-monitor.ts`, `governance-enforcer.ts`, `index.ts`) | `src/lib/enterprise-contracts/` | **Completely orphaned.** Zero imports anywhere in `src/` outside the directory itself. All state is in-memory `Map`/array with hardcoded caps (500/200/500 items) — no Supabase persistence, no route, no agent, no UI references it. Confirmed dead code, not a parallel system to avoid duplicating — there is nothing live to duplicate. |
| `customer_addresses` table | `supabase/migrations/001_initial_schema.sql:139-152` | **Live, already multi-location-capable.** `customer_id` (not unique — one customer, many rows), `label`, `street`, `unit`, `city`, `state`, `zip`, `country`, `location` (PostGIS point), `is_default`, `tenant_id`. No schema change needed to support a commercial account's multiple service locations. |
| `profiles.role` | existing enum | Includes `customer`/`provider`/`admin`/`super_admin`/`dispatcher`/`franchise_owner`. No `commercial`/`account_manager` concept. |

**Conclusion**: `src/lib/enterprise-contracts/` is dead, unwired code with an in-memory-only design that does not satisfy Rule 3 (revenue traceability) or persist anything — it cannot be "extended" in place because nothing references it. Per the same precedent as the Batch X+2 `subscriptions` table, its column shapes (`EnterpriseContract` type: sla/volume_commitment/custom_terms/franchise; `SLAContractBreachEvent`: uptime/response_time/resolution_time/throughput; `ContractGovernanceCheck`: spend_velocity/usage_compliance/tier_eligibility/renewal_readiness) are reused as the design basis for the new persisted `commercial_contracts`/`commercial_service_plans` tables, but the in-memory module itself is superseded, not imported into. `customer_addresses` already satisfies the multi-location requirement for `commercial_locations` — Phase 5 should reference it (or mirror its shape under a `commercial_account_id` instead of `customer_id`) rather than reinvent address modeling.

## 4. Existing revenue intelligence (commercial extension point)

| Component | Location | Status |
|---|---|---|
| `revenue_records` table | `supabase/migrations/20260530000001_revenue_records.sql` | **Live.** Canonical per-payment ledger (`gross_amount_cents`, `platform_fee_cents`, `provider_payout_cents`, `franchise_royalty_cents`), linked to `job_id`/`payment_id`/`franchise_territory_id`/`membership_subscription_id` (Batch X+2). |
| FINN | `src/lib/agents/finn.ts` | `evaluatePayout()`, `reconcile()`, `estimateJobEconomics()`, `calculateRecurringRevenue()` (Batch X+2). Zero commercial-account revenue logic. |

**Conclusion**: Commercial Revenue Intelligence (Phase 7) follows the exact same pattern as Batch X+2's `calculateRecurringRevenue()` — a new FINN method reading `revenue_records` filtered by a new `commercial_account_id`/`commercial_contract_id` column, not a second ledger.

## 5. GABRIEL — current scope (governance/compliance only)

| Method | File:line | Purpose |
|---|---|---|
| `screenProvider()` | `src/lib/agents/gabriel.ts` | Compliance screening — documents, insurance, background checks, category licenses |
| `auditJob()` | `src/lib/agents/gabriel.ts` | Job record audit — quote signature, payment proof, photos, customer confirmation, disputes |

`role = "Governance & Compliance"` (class property). GABRIEL has **no executive-intelligence surface today** — the directive's Phase 8 ("GABRIEL Executive Intelligence") is a genuine scope addition to the existing class, not a relabeling of existing methods. This is the one phase in this batch that extends an agent into materially new territory rather than activating dead schema; it must still follow Rule 1 by adding methods to the existing `GabrielAgent` class rather than creating a new "executive agent."

## 6. MAX dispatch — current matching factors

`src/lib/agents/max.ts`: 5-factor AI-driven matching declared in the system prompt — Trust score (30%), Proximity & ETA (25%), Category match (20%), Availability (15%, only `provider.is_online` boolean — no workload/job-count query), Response rate (10%, no real acceptance-rate field passed). Deterministic fallback (no `ANTHROPIC_API_KEY`) sorts purely by `trust_score`, hardcodes `eta_minutes: 30`.

**Confirmed gaps**: no certification/license check (that's GABRIEL's `screenProvider()`, not consulted at dispatch time), no capacity/concurrent-job-count check, no contract/SLA term consideration. Phase 9 ("MAX Dispatch Intelligence Extension") must add commercial-job awareness (does this provider hold a valid certification for a commercial contract's required service type? is dispatch priority elevated per an SLA term?) as additional factors on the existing matching call — not a second dispatch engine.

## 7. Migration naming

Latest migration: `supabase/migrations/20260530000002_membership_engine.sql`. This batch's first migration must be `supabase/migrations/20260530000003_expansion_commercial_accounts.sql` (next sequential timestamp suffix).

## 8. Expansion/Commercial gaps (summary)

1. No persisted market-region metrics — `territory_scorecards.demand_index`/`supply_index` exist as dead columns; `src/lib/expansion/*` are pure functions with no DB read.
2. No supply/demand intelligence computed from real `jobs`/`providers` data — NOVA has zero methods for this.
3. No commercial account model at all — `enterprise-contracts/` is dead, unwired, in-memory-only code with no persistence.
4. No commercial revenue traceability — `revenue_records` has no commercial-account linkage column today.
5. No executive intelligence on GABRIEL — it is compliance-only.
6. No commercial-awareness in dispatch — MAX's 5 factors have no certification/capacity/contract/SLA dimension.
7. No commercial surfacing in Command Center or customer/commercial experience.

These seven gaps map directly to Phases 2–11 of this batch.
