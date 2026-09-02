# Known Limitations (Platform Certification Batch, Phase 9)

Consolidated, honest list of every disclosed gap surfaced across this certification batch. None of these block certification; all are recorded so they are visible before Franchise/Enterprise/National Marketplace work begins.

## Agent Workforce

- `NovaAgent.assessMarketDemand/assessMarketSupply/recommendExpansionOpportunities`, `FinnAgent.calculateCommercialRevenue`, `MaxAgent.assessCommercialDispatchPriority`, `GabrielAgent.generateExecutiveBriefing` have no automation-event or cron trigger — they execute correctly and are visible in Command Center, but only fire on page render, not autonomously. (`AGENT_WORKFORCE_CERTIFICATION.md`)
- REX's `provider_scoring` event path is deterministic (no LLM call), so it does not write an `agent_logs` row — Command Center's REX execution count under-reports actual trust-score update frequency. (`AGENT_WORKFORCE_CERTIFICATION.md`)

## Automation Fabric

- Retry backoff is linear (1/2/3 minutes), not exponential. (`AUTOMATION_FABRIC_CERTIFICATION.md`)
- No dedicated dead-letter table — failed items remain in `automation_queue` with `status='failed'`.
- No circuit breaker for a systemically failing handler/third-party API.
- No automated failure alerting (email/Slack/PagerDuty) — admins must visit `/admin/automation`.
- Handler dispatch is a hardcoded switch/import list in `router.ts`, not a dynamic registry.

## Security & Multi-Tenancy

- `agent_logs` table has no RLS policy (app-level protection only).
- `membership_entitlements` and `provider_certification_requirements` RLS policies are `using (true)` (intended as public catalog data, not tenant-scoped).
- Nullable `tenant_id` on access-control tables (`personas`, `permission_objects`, etc.) is intentional but undocumented in the migration.
- Customer dashboard's commercial-account lookup uses the admin client (bypasses RLS) rather than the authenticated client, even though the underlying RLS policy is confirmed correct. (`SECURITY_MULTITENANCY_CERTIFICATION.md`)

## Performance

- No live booking/dispatch/dashboard latency numbers exist — this environment has no running instance or production traffic. Agent (`agent_logs.latency_ms`) and automation (`automation_runs.started_at/completed_at`) latency are already instrumented and will produce real numbers as soon as live traffic exists. (`PERFORMANCE_BASELINE.md`, `E2E_JOURNEY_CERTIFICATION.md`)
- Command Center performs many parallel, uncached Supabase queries per page load (16+ at the top level, plus internal queries inside each Batch X+2/X+3 read-time intelligence function) — fine at current scale, first place to look if dashboard latency becomes a complaint.

## E2E Validation Methodology

- All E2E journey, expansion, commercial, and membership certifications in this and prior batches are **static/code-path certifications** — no live Supabase project, live Stripe integration, or live cron execution was exercised in this sandbox. This is consistent across every certification doc in `docs/velocity/` to date.

## Carry-forward from prior batches (not re-litigated here)

- Live-data validation for Expansion Intelligence (`market_demand`/`market_supply`/`market_opportunities` computations against real territory/job/provider rows) remains outstanding per `EXPANSION_INTELLIGENCE_E2E_VALIDATION.md`.
- Orphaned/zero-write tables identified in `EVIDENCE_ARCHITECTURE_AUDIT.md` (prior batch) have not been re-audited in this batch; no new orphaned tables were introduced by Batches X+2/X+3.
