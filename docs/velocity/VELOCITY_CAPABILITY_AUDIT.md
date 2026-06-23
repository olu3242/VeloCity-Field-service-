# VeloCity Capability Audit — Mandatory Pre-Work (Superbatch 1)

Per the directive's own rule ("EXTEND NEVER DUPLICATE") and mandatory pre-work requirement, this audit inventories what already exists in the real, wired-in codebase before any "Autonomous Field Service OS" phase work begins. Every line below is backed by a real file path, not an assumption.

## 1. Agent Workforce — already substantially built

`src/lib/agents/registry.ts` contains a **formal, enterprise-grade registry for all 10 named agents** — the exact same 10 the directive lists (ALICE, MAX, QUINN, NOVA, REX, IVY, FINN, LENA, TESS, GABRIEL). Each has a real contract:

| Agent | Capability | Real supported events | Status |
|---|---|---|---|
| ALICE | intake | `job.created`, `job.reclassify_requested` | active |
| MAX | dispatch | `job.dispatch_requested`, `job.provider_unassigned` | active |
| QUINN | quote | `quote.created`, `quote.review_requested`, `job.quote_disputed` | active |
| NOVA | workflow | `job.status_change_requested`, `job.provider_arrived`, `job.completed`, `job.cancelled` | active |
| REX | quality | `review.submitted`, `provider.trust_score_requested`, `job.completed` | active |
| IVY | dispute | `dispute.opened`, `dispute.evidence_submitted`, `dispute.escalated` | active |
| FINN | finance | `payment.payout_requested`, `payment.failed`, `payment.refund_requested`, `job.completed` | active |
| LENA | retention | `job.completed`, `customer.churn_risk_detected`, `review.submitted` | active |
| TESS | territory | `territory.analysis_requested`, `provider.supply_check`, `demand.surge_detected` | active |
| GABRIEL | governance | `audit.compliance_check_requested`, `provider.onboarding_review`, `dispute.escalated`, `payment.anomaly_detected` | active |

Each registration declares `execution_limits`, `retry_policy`, `audit_requirements`, and `observability_hooks` — this is real infrastructure, not a stub. `src/lib/agents/runAgent.ts` and `src/lib/agents/base.ts` provide the execution harness. Two agents (`alice.classify`, `max.match`) are confirmed *actually invoked* from live API routes (`src/app/api/jobs/route.ts`, `src/app/api/admin/dispatch/route.ts`) — the rest are registered with contracts but their live invocation sites were not all individually traced in this pass.

**Implication for the directive's "Phase 2: Agent Workforce OS":** the Agent Registry, capability declarations, and execution-limit/retry framework the directive asks to "build" already exist. Building a second registry would be duplicate work the directive's own rule prohibits.

## 2. Command Center — already built, under a different name than the directive assumes

`/admin/command-center` (real route, documented in `docs/command-center.md`) is a real "executive operating layer" with:
- `src/lib/command-center/opsHealthScore.ts`, `revenueHealthScore.ts`, `automationHealthScore.ts`, `marketplaceHealthScore.ts`, `executiveSummary.ts`, `recommendedActions.ts`
- Real widgets: GMV, net revenue, commission revenue, average job value, active/unassigned jobs, SLA breaches, payment failures, payout queue, disputes, provider supply gaps, churn risk, territory readiness, AI agent activity, failed automations
- Deterministic, auditable 0-100 health scores with severity levels, reasons, and recommendations
- Explicitly documented as **not replacing** the existing admin dashboard or growth dashboard — it's a summarization layer

This single page already covers most of the directive's Phase 1 ("Field Service Command Center" / Mission Control), a large slice of Phase 9 ("Executive OS"), and the core of Phase 13 ("Marketplace Intelligence" — `marketplaceHealthScore.ts` already computes supply/demand/health signals).

**Implication:** building a new `/admin/mission-control` page would directly duplicate `/admin/command-center`. If a rename or consolidation is wanted, that's a scoped, low-risk task — building a second parallel command center is not.

## 3. Automation Fabric — already real, event-driven

`src/lib/automation/` contains `emitEvent.ts`, `router.ts`, `worker.ts`, `sla.ts`, `governance.ts`, `growthEvents.ts`, `types.ts`, and a `handlers/` directory. Cron-driven processing is real and wired: `src/app/api/cron/automation`, `daily`, `daily-intelligence`, `payouts`, `sla`. Event emission (`emitEvent(supabase, {...})`) is called from real booking/dispatch/offer routes with `dedupKey`-based deduplication, wrapped in try/catch so automation failures can't block core writes (confirmed verbatim comment: "Automation failure must never block booking creation").

**Implication:** the directive's Phase 3 "Automation Fabric" (rules engine, queue, retry framework, execution logs) is already real, not aspirational. Extending it means adding new event types/handlers to the existing `router.ts`/`handlers/`, not building a parallel engine.

## 4. Trust / scoring infrastructure — real, but fragmented across two layers

Two genuinely real, in-use trust signals exist:
- `src/lib/scoring/providerTrustScore.ts`, `customerTrustScore.ts` — used by real provider dashboards (`provider.trust_score` is read in `provider/dashboard/page.tsx` and the dispatch route).
- `src/lib/trust/provider-trust.ts`, `trust-signals.ts` — a second, separate trust module.

Separately, there is a large body of **orphaned, never-imported "trust" code**: `src/runtime-trust/` (`federation-trust.ts`, `trust-mesh.ts`, `trust-score.ts`), `src/intelligence-mesh/trust-mesh.ts`, `src/lib/ecosystem-connectors/trust-graph.ts`, `src/federation-governance/trust-scorer.ts`. None of these are imported anywhere in `src/app`, `src/lib` (outside themselves), or `src/components` — confirmed via a direct grep for imports from these paths, which returned zero hits.

**Implication:** there is no single "Trust Center" — there are two real, used trust modules and roughly five unused, speculative ones with sci-fi naming (`trust-mesh`, `federation-trust`) that add zero real capability today.

## 5. Critical finding: a large body of orphaned, fabricated-looking infrastructure already exists in this repo

A directory scan for "runtime" and related speculative terms turned up roughly 60+ top-level `src/` directories with names like `neural-cloud`, `digital-consciousness`, `operational-neural-runtime`, `runtime-consciousness-network`, `autonomous-runtime/self-healing-runtime`, `runtime-cognition/runtime-reasoning`, `runtime-brain`, `intelligence-mesh`, `federation-governance`, `simulation-cloud`, `neural-execution`, `adaptive-fabric`, `workflow-evolution`.

Direct inspection of one example (`src/digital-consciousness/runtime-self-model.ts`) shows a `RuntimeSelfModel` interface with fields like `perceivesItself`, `selfAssessedCapability`, `federationPeers` — internally consistent-looking code, but disconnected from any real subsystem (the numbers are hardcoded zeros with no real data source).

A repo-wide import check (`grep` across `src/app`, `src/lib`, `src/components` for imports from these directories) found **zero import sites**. Out of roughly 1,093 total `.ts`/`.tsx` files in `src/`, only ~694 live under `app/`, `lib/`, or `components/` (the real, wired-in application). The remaining ~400 files are these orphaned, never-imported modules.

**This is the single most important finding of this audit.** The codebase already contains a large volume of unintegrated, grandiosely-named infrastructure that was apparently generated in response to past directives of similar scope to this one, without ever being wired into the real application. Continuing to add new "OS" layers (Phase 11-20) without first addressing this would repeat the exact mistake the directive's own "do not duplicate" rule is trying to prevent — just under new phase numbers instead of new file prefixes.

## 6. Learning / Skills / Certification — does not exist for providers (real gap, not duplicate risk)

No technician-facing learning, training, or skills-certification system exists. The only "learning" and "certification" files found (`src/intelligence-mesh/operational-learning.ts`, `src/lib/intelligence/learning-engine.ts`, `src/lib/certification/isolation-certifier.ts`) are either orphaned (the first two, confirmed via the same import check) or relate to tenant-isolation testing, not provider skill certification. Unlike the agent/command-center/automation findings above, this is a genuine gap — the directive's Phase 4 and Phase 15 ("Provider Learning OS," "Skills & Certification OS") would be net-new build work, not extension of something that already exists.

## 7. Provider business management, recurring revenue, service catalog — do not exist

No `/provider/business` page, no `service_categories`/`service_packages`/`service_pricing` tables, no membership/recurring-plan tables were found. These (Phases 11, 14, 17 in Superbatch 2) are genuine gaps, not duplicate risks — see `VELOCITY_GAP_ANALYSIS.md` for the full breakdown of what's real-and-extend vs. real-gap-and-build.
