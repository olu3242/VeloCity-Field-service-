# VeloCity Traceability Matrix

Maps every directive "phase" to the real file(s) that already implement it (if any), so future work always extends a named, real file rather than guessing or duplicating.

| Phase / Capability | Real implementation (extend this) | Confirmed wired-in? |
|---|---|---|
| Agent Registry | `src/lib/agents/registry.ts` | Yes — `AGENT_REGISTRY` with 10 agents, contracts, retry policy |
| Agent execution harness | `src/lib/agents/runAgent.ts`, `src/lib/agents/base.ts` | Yes |
| ALICE (intake) | `src/lib/agents/alice.ts` | Yes — `alice.classify(...)` called from `src/app/api/jobs/route.ts` |
| MAX (dispatch) | `src/lib/agents/max.ts` | Yes — `max.match(...)` called from `src/app/api/admin/dispatch/route.ts` |
| QUINN (quote) | `src/lib/agents/quinn.ts` | Registered; live invocation site not traced this pass |
| NOVA (workflow) | `src/lib/agents/nova.ts` | Registered; live invocation site not traced this pass |
| REX (quality) | `src/lib/agents/rex.ts` | Registered; live invocation site not traced this pass |
| IVY (dispute) | `src/lib/agents/ivy.ts` | Registered; live invocation site not traced this pass |
| FINN (finance) | `src/lib/agents/finn.ts` | Registered; live invocation site not traced this pass |
| LENA (retention) | `src/lib/agents/lena.ts` | Registered; live invocation site not traced this pass |
| TESS (territory) | `src/lib/agents/tess.ts` | Registered; live invocation site not traced this pass |
| GABRIEL (governance) | `src/lib/agents/gabriel.ts` | Registered; live invocation site not traced this pass |
| Command Center / Mission Control | `src/app/admin/command-center/`, `src/lib/command-center/*.ts`, documented in `docs/command-center.md` | Yes — real route, real health-score modules |
| Ops health score | `src/lib/command-center/opsHealthScore.ts` | Yes |
| Revenue health score | `src/lib/command-center/revenueHealthScore.ts` | Yes |
| Automation health score | `src/lib/command-center/automationHealthScore.ts` | Yes |
| Marketplace health score | `src/lib/command-center/marketplaceHealthScore.ts` | Yes — extend this for Phase 13, do not build a new `/admin/marketplace` |
| Executive summary | `src/lib/command-center/executiveSummary.ts` | Yes — extend this for Phase 9, do not build a new `/admin/executive` |
| Event emission | `src/lib/automation/emitEvent.ts` | Yes — called from jobs/offers/dispatch routes with `dedupKey` |
| Event routing | `src/lib/automation/router.ts`, `src/lib/automation/handlers/` | Yes |
| Automation worker | `src/lib/automation/worker.ts` | Yes |
| SLA tracking | `src/lib/automation/sla.ts`, `src/app/api/cron/sla` | Yes |
| Growth events | `src/lib/automation/growthEvents.ts` | Exists; not fully traced — read before building Phase 8 (Growth OS) |
| Provider trust score | `src/lib/scoring/providerTrustScore.ts` | Yes — read in `provider/dashboard/page.tsx` and dispatch route |
| Customer trust score | `src/lib/scoring/customerTrustScore.ts` | Exists; consumer sites not traced this pass |
| Secondary trust module (overlap risk) | `src/lib/trust/provider-trust.ts`, `src/lib/trust/trust-signals.ts` | Exists — **reconcile with `scoring/providerTrustScore.ts` before extending either; two real trust modules currently coexist** |
| Payment pre-authorization gate | `src/lib/payments/preAuth.ts` (`hasPaymentCommitment`) | Yes — hard gate in `src/app/api/admin/dispatch/route.ts`, returns 402 + audit log if absent |
| Available-provider lookup | `src/lib/providers/getAvailableProviders.ts` | Yes |
| Tenant isolation | `src/lib/tenancy.ts` (`getTenantId`) | Yes — applied consistently via `.eq("tenant_id", tenantId)` |
| Service category source of truth | `src/lib/utils/index.ts` (`SERVICE_CATEGORY_LABELS`, `SERVICE_CATEGORY_ICONS`) | Yes — 18 categories, used by booking UI and now the landing page stat (fixed in the prior design-convergence pass) |
| Notifications | `src/app/api/notifications/route.ts`, `src/lib/notifications/server.ts` (`createInAppNotification`) | Yes |
| Provider earnings | `src/app/provider/earnings/page.tsx` | Yes — real 82% revenue-share constant, now using the shared `Table` component |

## Orphaned code — do not extend, do not reference as precedent

The following real files exist but have **zero import sites** anywhere in `src/app`, `src/lib`, or `src/components` (confirmed via direct grep). They should not be treated as existing capability, and new work should not be modeled on their patterns:

`src/neural-cloud/`, `src/digital-consciousness/`, `src/runtime-brain/`, `src/intelligence-mesh/`, `src/federation-governance/`, `src/autonomous-runtime/`, `src/simulation-cloud/`, `src/neural-execution/`, `src/adaptive-fabric/`, `src/workflow-evolution/`, `src/runtime-trust/`, `src/runtime-cognition/`, and roughly 50 more similarly-named top-level directories under `src/`.

These collectively account for roughly 400 of the repo's ~1,093 TypeScript files. They are not part of the real, running VeloCity application. Any future phase that asks for something already named here (e.g. "Trust Mesh," "Runtime Brain," "Federation Governance") should be re-specified in terms of real product needs and built against the real files in the table above — not by resuming or extending these orphaned modules.
