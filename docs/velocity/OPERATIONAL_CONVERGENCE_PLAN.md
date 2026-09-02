# VeloCity Operational Convergence Plan

Pre-work for the Operational Convergence Batch (Agent Activation + Service Catalog Engine + Certification). Reconciles `VELOCITY_CAPABILITY_AUDIT.md`, `VELOCITY_GAP_ANALYSIS.md`, and `VELOCITY_TRACEABILITY_MATRIX.md` against a fresh, direct read of the real code (not a re-run of the old grep-based pass). Every claim below cites a real file.

## 1. Headline correction to the prior audit

`VELOCITY_CAPABILITY_AUDIT.md` §1 stated: *"Two agents (alice.classify, max.match) are confirmed actually invoked... the rest are registered with contracts but their live invocation sites were not all individually traced."*

That statement undersold the real system. A direct trace of `src/lib/automation/router.ts`, `src/lib/automation/worker.ts`, `src/lib/automation/handlers/*.ts`, `src/lib/agents/runAgent.ts`, and `src/lib/agents/base.ts` shows:

- **All 10 agents have a real handler in `src/lib/automation/handlers/`** (`alice-intake.ts`, `max-dispatch.ts`, `quinn-quote.ts`, `nova-workflow.ts`, `rex-completion.ts`, `ivy-dispute.ts`, `finn-payment.ts`, `lena-retention.ts`, `tess-territory.ts`, plus the router's built-in GABRIEL governance branch).
- **Every handler calls `runAgent("<NAME>", input)`**, which dispatches to the real agent's `BaseAgent.run()` (confirmed via `grep` for `runAgent` imports in each handler file — all 7 non-ALICE/MAX/GABRIEL handlers import it).
- **`BaseAgent.run()` unconditionally writes to `agent_logs`** (`src/lib/agents/base.ts`, the `log()` method) for every single invocation, success or failure — this is real, automatic, per-agent evidence with `tokens_used`, `latency_ms`, and `error`. No new evidence system is needed.
- **`routeAutomationEvent()` appends a GABRIEL governance audit row after every processed event**, regardless of branch (`src/lib/automation/router.ts`, the final `agent_logs.insert({ agent_name: "GABRIEL", action: "Governance Audit", ... })` call) — GABRIEL is structurally active on 100% of automation traffic, not partial.
- **Events are really emitted from real app routes** — a direct grep of `emitEvent(` call sites under `src/app` returns 38 distinct real event-type strings, including `quote_submitted`, `dispute_opened`, `job_completed`, `payout_queued`, `retention_campaign_due`, `daily_territory_analysis`, `tip_submitted` — i.e. real triggers for QUINN, IVY, REX/NOVA, FINN, LENA, TESS.
- **The queue is really processed on a schedule** — `vercel.json` registers `/api/cron/automation` every 5 minutes and `/api/cron/daily-intelligence` daily at 06:00. `src/app/api/cron/automation/route.ts` and `.../daily-intelligence/route.ts` both emit real events from real table scans (expired offers, SLA breaches, stuck jobs, failed payments/notifications, payout queue, provider scoring, retention campaigns, territory analysis) and then call `processAutomationQueue()`, which calls `routeAutomationEvent()` for every queued row.

**Conclusion: the Agent Activation Program's core wiring already exists and is already live.** What was genuinely missing — confirmed by direct inspection, not assumption — was narrower than Part A assumed:

| Gap | Status before this batch | Fixed in this batch |
|---|---|---|
| Command Center showing all 10 agents with execution count / success rate / failure rate / last execution / avg runtime | Partial — `/admin/command-center` already had an "AI Agent Activity" card, but it only listed the 5 most recent raw log rows with no per-agent breakdown | **Done** — extended the existing card into a 10-row table computed from `agent_logs`, reusing the existing query (bumped `limit` from 50→500, narrowed `select` to the needed columns) and the existing `AGENT_REGISTRY` as the canonical agent list. No second dashboard created. |
| A written, evidence-based trigger→execution→evidence→visibility trace per agent | Missing | `AGENT_INVOCATION_MATRIX.md` (this batch) |
| Event-name taxonomy mismatch between `registry.ts` (`supported_events`, dot-case, e.g. `"quote.created"`) and the real automation system (`types.ts` `AutomationEventType`, snake_case, e.g. `"quote_submitted"`) | Cosmetic inconsistency — `registry.ts`'s `supported_events` field is documentation-only metadata; it is never read by `runAgent` or `router.ts` at runtime | Documented as a known naming inconsistency in `AGENT_INVOCATION_MATRIX.md`; not fixed by renaming (would touch 10 registry entries for zero functional change and risk breaking anything that does read `supported_events` for display purposes) |

This means Part A of the batch is **certification + one targeted UI extension**, not a rebuild. Re-running the original "wire every partially connected agent into real platform events" instruction literally would have built a second, parallel event-routing system next to the real one — exactly the duplication the directive prohibits.

## 2. Existing capability inventory (confirmed this pass)

| Capability | Real file(s) |
|---|---|
| Agent registry (contracts, limits, retry policy) | `src/lib/agents/registry.ts` |
| Agent execution harness + evidence logging | `src/lib/agents/runAgent.ts`, `src/lib/agents/base.ts` → `agent_logs` table |
| Automation event types | `src/lib/automation/types.ts` |
| Event emission + dedup | `src/lib/automation/emitEvent.ts` → `automation_events` table |
| Event routing to agent handlers | `src/lib/automation/router.ts` → `src/lib/automation/handlers/*.ts` |
| Queue processing | `src/lib/automation/worker.ts` → `automation_queue`, `automation_runs` tables |
| Scheduled triggers | `vercel.json` crons → `/api/cron/automation` (5 min), `/api/cron/daily-intelligence` (daily), `/api/cron/sla`, `/api/cron/payouts`, `/api/cron/daily` |
| Command Center / executive layer | `src/app/admin/command-center/page.tsx`, `src/lib/command-center/*.ts` |
| Service category source of truth | Postgres enum `service_category` (`supabase/migrations/001_initial_schema.sql:63`), 18 values, used by `jobs.category` and `providers.categories[]` |
| Pricing | `src/lib/pricing/{pricingRules,calculatePrice,urgencyPricing,locationPricing,complexityPricing,surgePricing}.ts` — category-level, hardcoded |
| Dispatch matching | `src/lib/agents/max.ts` (`match()`) + `src/lib/providers/getAvailableProviders.ts` — matches on `providers.categories @> [job.category]` only |
| Provider business profile | `src/app/provider/business/page.tsx`, `src/app/api/providers/me/route.ts` (added this session) |

## 3. Existing invocation inventory

See `AGENT_INVOCATION_MATRIX.md` for the full per-agent trace. Summary: **all 10 agents are ACTIVE** by the trigger→execution→evidence→visibility test, where "visibility" was the one real gap (now closed).

## 4. Existing service-model inventory

Confirmed via direct migration read (`supabase/migrations/001_initial_schema.sql`, `007_pricing_payments_automation.sql`, `008_real_world_ops.sql`):

- `service_category` enum (18 values) — real, used.
- `jobs.category`, `providers.categories[]` — real, used.
- `quotes.line_items jsonb` — real but schemaless (no line-item-type structure).
- `pricing_decisions`, `payment_ledger`, `payout_ledger`, `refund_records` — real, used by FINN/payments.
- `provider_availability`, `provider_settings` (radius, max jobs/day) — real, used by dispatch eligibility.
- **No `service_types`, `service_packages`, `provider_service_capabilities`, `provider_skills`, `certifications`, or `service_pricing_profiles` tables exist.** This matches `VELOCITY_GAP_ANALYSIS.md`'s "Phase 14: PARTIAL" classification exactly — the category layer is real, the sub-categorization/package/skill layer is the genuine gap.

## 5. Gap validation

Confirms `VELOCITY_GAP_ANALYSIS.md` row 14 (Service Catalog Engine: PARTIAL) and row 15 (Skills & Certification: GAP, sequenced after a Learning OS that doesn't exist). Does **not** confirm the original Part A premise that 8 agents needed new wiring — that premise is superseded by §1 above.

## 6. Build plan for this batch

**Part A (Agent Activation):** Certification only, plus the Command Center extension already shipped. No new event types, handlers, or logging tables — would duplicate `router.ts`/`agent_logs`.

**Part B (Service Catalog Engine):** Real, additive build:
1. Additive migration adding `service_types`, `service_packages`, `provider_service_capabilities`, `service_pricing_profiles` — FK'd to the existing `service_category` enum, never replacing it.
2. Seed the 8 directive-listed Home Services categories' real subset of `service_category` with representative `service_types` and `service_packages` (Basic/Standard/Premium/Emergency/Commercial).
3. Extend (not replace) `getAvailableProviders.ts` to optionally weight/filter by `provider_service_capabilities` when present, falling back to the existing `categories[]` check when a provider has no capability rows yet (backward-compatible).
4. Extend `calculatePrice.ts` to optionally consult `service_pricing_profiles` for a category+package combination, falling back to the existing hardcoded `CATEGORY_BASE_PRICE_CENTS` when no profile row exists.
5. Extend the booking flow (`src/app/book/page.tsx`) to optionally surface a service-type/package step when types exist for the chosen category, preserving the existing category-only flow as the fallback — old bookings and the existing flow keep working untouched.
6. Extend Command Center / growth dashboard with a real service-type/package breakdown, reusing the existing in-memory aggregation pattern already used for `revenueByCategory` and `supplyGaps` in `src/app/admin/growth/page.tsx` — no new dashboard.

This plan deliberately does **not** touch LENA, FINN, or dispatch's core ranking algorithm beyond the additive capability lookup — those are real, working systems; Phase B9/B10's "extend LENA/FINN" asks are satisfied by reading from the new tables where they're useful, not by rewriting the agents.
