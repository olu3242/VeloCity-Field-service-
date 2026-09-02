# Agent Invocation Matrix

Direct, evidence-based trace of all 10 registered agents: registration → contract → invocation → event source → execution path → evidence → UI visibility. Every row cites a real file. No status is asserted without a grep/read confirming it.

Legend: **ACTIVE** = real trigger exists in shipped code AND reaches the agent's execution AND produces evidence AND is visible somewhere. **PARTIAL** = some link in the chain is missing or synthetic. **INACTIVE** = registered only, no real reachable trigger.

## ALICE — intake

- Registration: `src/lib/agents/registry.ts:50-63` — `supported_events: ["job.created", "job.reclassify_requested"]`
- Implementation: `src/lib/agents/alice.ts`, exports `alice.classify(...)`
- Direct invocation: `src/app/api/jobs/route.ts:94-98` — called synchronously on every job creation
- Automation handler: `src/lib/automation/handlers/alice-intake.ts`, routed from `service_request_created` / `serviceability_passed` / `serviceability_failed` in `src/lib/automation/router.ts:65-72`
- Event source: `emitEvent(..., { type: "service_request_created", ... })` emitted from `src/app/api/jobs/route.ts:129-149` on every booking
- Evidence: `agent_logs` row per call (via `BaseAgent.run()` → `log()`)
- Visibility: Command Center "AI Agent Activity" table (this batch); `ai_classification` jsonb stored on the `jobs` row itself
- **Status: ACTIVE**

## MAX — dispatch

- Registration: `registry.ts:65-78` — `["job.dispatch_requested", "job.provider_unassigned"]`
- Implementation: `src/lib/agents/max.ts`, exports `max.match(...)`
- Direct invocation: `src/app/api/admin/dispatch/route.ts`, gated by `hasPaymentCommitment` (`src/lib/payments/preAuth.ts`) and `getAvailableProviders`
- Automation handler: `src/lib/automation/handlers/max-dispatch.ts`, routed from `provider_offer_sent` / `provider_offer_expired` / `job_reassigned` / `no_provider_accepted` (`router.ts:75-83`)
- Event source: `provider_offer_expired` emitted every 5 minutes from `src/app/api/cron/automation/route.ts` for any expired offer
- Evidence: `agent_logs`
- Visibility: Command Center table; dispatch route response
- **Status: ACTIVE**

## QUINN — quote

- Registration: `registry.ts:80-93` — `["quote.created", "quote.review_requested", "job.quote_disputed"]`
- Implementation: `src/lib/agents/quinn.ts`, exports `reviewQuote()`, `generateEstimate()`
- Direct invocation: `src/app/api/quotes/route.ts`
- Automation handler: `src/lib/automation/handlers/quinn-quote.ts`, routed from `quote_submitted` / `quote_validated` / `quote_flagged` / `change_order_submitted` / `quote_approved` / `quote_rejected` (`router.ts:108-121`); on `quote_approved` the router also chains into `handleFinnPayment`
- Event source: `quote_submitted` emitted from the quotes route on provider quote submission
- Evidence: `agent_logs`
- Visibility: Command Center table
- **Status: ACTIVE**

## NOVA — workflow

- Registration: `registry.ts:95-113` — job status-change events
- Implementation: `src/lib/agents/nova.ts`
- Direct invocation: `src/app/api/jobs/[id]/transition/route.ts` (every job status transition)
- Automation handler: `src/lib/automation/handlers/nova-workflow.ts`, routed from `job_accepted` / `job_state_changed` / `job_started` / `provider_arrived` / `job_completed` / `customer_confirmed` (`router.ts:86-106`)
- Event source: emitted from the job transition route on every real status change
- Evidence: `agent_logs`
- Visibility: Command Center table; `job_status_history` table
- **Status: ACTIVE**

## REX — quality

- Registration: `registry.ts:115-128` — `["review.submitted", "provider.trust_score_requested", "job.completed"]`
- Implementation: `src/lib/agents/rex.ts`
- Direct invocation: `src/app/api/reviews/route.ts` (every customer review submission)
- Automation handler: `src/lib/automation/handlers/rex-completion.ts`, routed from `job_completed` / `customer_confirmed` / `provider_scoring` / `provider_scoring_due` (`router.ts:93-106`, `155-160`)
- Event source: `provider_scoring_due` emitted daily for every provider from `src/app/api/cron/daily-intelligence/route.ts:48-65`; `job_completed` emitted from job lifecycle routes
- Evidence: `agent_logs`
- Visibility: Command Center table; `providers.trust_score` read by `provider/dashboard/page.tsx` and the dispatch route
- **Status: ACTIVE**

## IVY — dispute

- Registration: `registry.ts:130-143` — dispute lifecycle events
- Implementation: `src/lib/agents/ivy.ts`
- Direct invocation: `src/app/api/disputes/route.ts`
- Automation handler: `src/lib/automation/handlers/ivy-dispute.ts`, routed from `dispute_opened` / `dispute_resolved` (`router.ts:163-169`)
- Event source: `dispute_opened` emitted from the disputes route on real dispute creation
- Evidence: `agent_logs`
- Visibility: Command Center table; `disputes` count surfaced in the Command Center KPI row
- **Status: ACTIVE**

## FINN — finance

- Registration: `registry.ts:145-163` — payment/payout events
- Implementation: `src/lib/agents/finn.ts`, exports `evaluatePayout()`, `reconcile()`
- Direct invocation: none found in `src/app` (no synchronous route calls `finn.` directly) — reached only through the automation path
- Automation handler: `src/lib/automation/handlers/finn-payment.ts`, routed from `payment_authorized` / `payment_captured` / `payment_failed` / `refund_requested` / `refund_issued` / `chargeback_opened` / `payout_queued` / `payout_hold` / `payout_released` / `payout_failed` (`router.ts:124-150`); also chained from `quote_approved`
- Event source: `payout_queued` emitted every 5 minutes from `src/app/api/cron/automation/route.ts:111-122` for every captured/escrowed payment; `failed_payment_retry` emitted for every failed payment in the same cron
- Evidence: `agent_logs`
- Visibility: Command Center table; `payout_ledger`, `refund_records` tables surfaced as `payoutHolds`/`refundRisk` KPIs
- **Status: ACTIVE** (reached exclusively via the automation path, not a direct route — noted as the one real asymmetry across the 10 agents, not a gap, since the automation path is itself real and scheduled)

## LENA — retention

- Registration: `registry.ts:165-178` — `["job.completed", "customer.churn_risk_detected", "review.submitted"]`
- Implementation: `src/lib/agents/lena.ts`, exports `recommendRebook()`, `assessChurnRisk()`
- Direct invocation: none found in `src/app` — automation path only
- Automation handler: `src/lib/automation/handlers/lena-retention.ts`, routed from `review_requested` / `subscription_due` / `warranty_callback_due` / `retention_campaign` / `retention_campaign_due` (`router.ts:174-182`)
- Event source: `retention_campaign_due` emitted daily for every customer from `src/app/api/cron/daily-intelligence/route.ts:68-77`
- Evidence: `agent_logs`
- Visibility: Command Center table only — no dedicated customer-facing "recommended for you" surface exists yet (a real, separate gap, tracked under Phase 12/Customer Experience OS, out of scope for this batch per the STOP CONDITION)
- **Status: ACTIVE**

## TESS — territory

- Registration: `registry.ts:180-197` — territory/supply/demand events
- Implementation: `src/lib/agents/tess.ts`
- Direct invocation: none found in `src/app` — automation path only
- Automation handler: `src/lib/automation/handlers/tess-territory.ts`, routed from `daily_territory_analysis` / `high_demand_area_detected` / `provider_shortage_detected` / `surge_pricing_recommended` / `territory_ready_for_expansion` / `franchise_candidate_area_detected` (`router.ts:185-209`) — also chains into `routeGrowthAutomationEvent` (`growthEvents.ts`)
- Event source: `daily_territory_analysis` emitted once a day from `src/app/api/cron/daily-intelligence/route.ts:30-42`; `franchise_candidate_area_detected` emitted conditionally in the same cron
- Evidence: `agent_logs`
- Visibility: Command Center table; "Territory Expansion" card (`src/lib/scoring/...calculateTerritoryHealthScore`) and Growth dashboard supply-gap widget
- **Status: ACTIVE**

## GABRIEL — governance

- Registration: `registry.ts:199-217` — compliance/onboarding/escalation/anomaly events
- Implementation: `src/lib/agents/gabriel.ts`, exports `gabriel.screenProvider(...)`
- Direct invocation: `src/app/api/providers/route.ts:40` and `src/app/api/admin/providers/[id]/approve/route.ts:42` — every provider signup and every admin approval action runs a real GABRIEL screening call
- Automation handler: invoked from `src/lib/automation/governance.ts:69` (a shared governance-check helper used by other handlers), and **`src/lib/automation/router.ts:248-256` runs an unconditional GABRIEL governance audit log after every single processed automation event, regardless of type** — GABRIEL is structurally on 100% of automation traffic, the broadest reach of any agent in the system
- Event source: every automation event (universal); plus direct provider-onboarding routes
- Evidence: `agent_logs` (one row per provider screening, plus one governance-audit row per automation event); `audit_logs` table also receives unhandled-event entries
- Visibility: Command Center table; provider approval API responses include `gabriel_check`/`gabriel_screen`
- **Status: ACTIVE**

## Cross-cutting findings

1. **Evidence infrastructure already satisfies Phase A3.** `BaseAgent.run()` (`src/lib/agents/base.ts`) writes timestamp, trigger (`action`), outcome (`output`), summary, success/failure (`error` null or not), and execution duration (`latency_ms`) for every call, for every agent, automatically. No new logging table was needed or built.
2. **Visibility was the one real gap (Phase A4), now closed.** `src/app/admin/command-center/page.tsx` previously showed only the 5 most recent raw `agent_logs` rows with no per-agent breakdown. It now computes, for all 10 `AGENT_REGISTRY` entries, execution count / success rate / failure count / average runtime / last execution, reusing the existing `agent_logs` query (column-narrowed, limit raised 50→500) — no second dashboard was created.
3. **Naming inconsistency (not a functional bug):** `registry.ts`'s `supported_events` field uses dot-case (`"job.completed"`) and is documentation/contract metadata only — it is never read at runtime by `runAgent()` or `router.ts`. The real, executing event taxonomy is `AutomationEventType` in `src/lib/automation/types.ts` (snake_case, e.g. `"job_completed"`). Both exist; only the snake_case one drives execution. Worth reconciling in a future pass, but renaming 10 registry entries to match has zero effect on runtime behavior and was left alone here to avoid risk-for-no-functional-gain.
4. **FINN, LENA, TESS have no synchronous direct-route invocation** — they are reached only through the automation event path. This is not a gap: the automation path is real, scheduled (every 5 minutes / daily), and backed by real table scans, not a synthetic demo trigger.
