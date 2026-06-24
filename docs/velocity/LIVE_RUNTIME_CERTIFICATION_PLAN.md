# Live Runtime Certification Plan (Final Go-Live Certification Batch, Phase 11)

The bridge between code certification (everything in `docs/velocity/` to date) and runtime certification (this plan). Every prior certification in this engagement is static — no live Supabase project, Stripe integration, or Vercel cron has ever been exercised (`RISK_REGISTER.md` Risk #5). This document defines the concrete steps to close that gap before declaring full production traffic, per `VELOCITY_GO_LIVE_DECISION.md`'s condition #3.

## 1. Environment setup

- Provision a production (or production-mirror staging) Supabase project. Apply all migrations in `supabase/migrations/` in order. Confirm RLS is active on the 24/27 tables expected to have it (`TENANT_BOUNDARY_CERTIFICATION.md`).
- Provision Stripe in **test mode** for this validation pass (switch to live keys only after the plan below passes). Register the webhook endpoint pointing at the deployed environment's `/api/webhooks/stripe`.
- Deploy to Vercel. Update `vercel.json` to register `cron/daily`, `cron/payouts`, and `cron/sla` (condition #1 from `VELOCITY_GO_LIVE_DECISION.md`) alongside the existing `cron/automation` and `cron/daily-intelligence` entries.
- Set every env var in `src/lib/env.ts`'s `REQUIRED_ENV_BY_AREA` map for this environment, including a real `CRON_SECRET`.
- Create exactly one `profiles` row with `role = 'admin'` for the operator running this validation.
- Confirm Supabase backup/PITR is enabled on the project (dashboard setting, not code).

## 2. Test tenants, providers, customers

Use the existing multi-tenant model — do not create a parallel test-data system.

- **Test tenant**: one dedicated `tenant_id` distinct from any real tenant, created the same way any production tenant is created (no special-casing).
- **Test customers**: 2 accounts under the test tenant — one with no membership, one enrolled in a membership plan (to exercise `handleMembershipLifecycle` and the daily membership-expiry sweep).
- **Test providers**: at least 2 providers under the test tenant, with distinct service categories/capabilities, so dispatch (`MAX.match()` → `getAvailableProviders.ts`) has more than one candidate to choose from and provider-offer/reassignment/penalty paths are exercisable.
- **Test commercial account**: 1 commercial account under the test tenant to exercise the commercial dispatch-priority and commercial-revenue paths.

All test data lives in real tables under a real (if synthetic) tenant — consistent with "extend, never duplicate."

## 3. Payment verification

- Submit a job, accept a quote, and run a real Stripe test-mode payment intent end-to-end through `/api/payments/intent` and the `/api/webhooks/stripe` handler. Confirm the webhook signature verification path (`constructWebhookEvent`) accepts a real Stripe-signed event, not just a mocked one.
- Trigger a refund and a dispute/chargeback test event from the Stripe CLI or dashboard; confirm `refund_issued`/`chargeback_opened` events route through `handleFinnPayment` and land in `revenue_records`.
- Run `cron/payouts` (once registered per step 1) against a completed job with an escrowed payment; confirm a real payout row moves through `payout-release.ts`'s retry path and reconciles in `treasury-ledger.ts`.
- Submit a tip via `/api/tips`; confirm `tip_submitted` routes through `handleTipSubmitted` and the corresponding Stripe payment intent.

## 4. Automation verification

- Manually insert an `automation_queue` row (or emit a real event via `/api/automation/emit`) and confirm `cron/automation` picks it up within its 5-minute window and `processAutomationQueue` marks it completed with a real `automation_runs` row.
- Force a handler failure (e.g. a malformed payload) and confirm the retry/backoff path works: `retry_count` increments, `available_at` follows the exponential-with-jitter schedule, and after 3 failures the row lands in `status = 'failed'`.
- **Operator controls — this is the one item this batch added real wiring for, and it must be proven live, not just unit-correct.** Call `POST /api/admin/runtime` with `pause_runtime`; confirm via Command Center's new "Runtime & Operator Controls" section (`COMMAND_CENTER_COMPLETENESS.md`) that the state shows "Paused," and confirm `cron/automation`'s next run actually skips processing (check `automation_runs` — no new rows during the pause window). Resume, and confirm processing picks back up.
- Call `disable_agent` for one action name (e.g. `"tess-territory"`) and confirm the next matching event is skipped with `output: { skipped: "agent_disabled:tess-territory" }` in the resulting `automation_runs.output`. Re-enable and confirm normal processing resumes.
- Force 5 consecutive failures for one action name to open its circuit breaker; confirm Command Center's "Circuit Breakers" card shows it as open, confirm subsequent calls short-circuit with `circuit_open:<name>` instead of invoking the handler, then call `reset_circuit` and confirm it closes and processing resumes.
- Run `cron/sla` (once registered) and confirm it does not double-emit events already emitted by `cron/automation`'s overlapping detection logic within the same minute — if it does, this is the known, previously disclosed overlap (`docs/automation/AUTOMATION_AUDIT.md`) and should be tracked, not treated as a new defect.

## 5. Agent verification

- Run `cron/daily-intelligence` once and confirm real `agent_logs` rows are written for TESS (`daily_territory_analysis`), REX (`provider_scoring_due`), and LENA (`retention_campaign_due`) against the test tenant's data.
- Walk one full job through ALICE (intake) → MAX (dispatch) → NOVA (workflow) → QUINN (quote, if applicable) → REX (completion/scoring) → FINN (payment) and confirm each writes its expected `agent_logs` row with non-null `latency_ms` — this is the first real latency data this engagement will have collected (`PERFORMANCE_BASELINE.md`'s instrumentation is ready; this step produces its first real numbers).
- Confirm GABRIEL's unconditional governance-audit log is written for every event processed in steps 3-4 above, per `routeAutomationEvent`'s unconditional `agent_logs` insert at the end of every run.

## 6. Acceptance criteria for this plan

- [ ] All steps in sections 1-5 completed against a real Supabase + Stripe test-mode + Vercel cron environment.
- [ ] No step above reveals a defect not already disclosed in `RISK_REGISTER.md` / `KNOWN_LIMITATIONS.md` — if one is found, it is documented as a new finding before declaring this plan complete, not silently patched and forgotten.
- [ ] First real latency numbers collected for at least one agent and one automation run, closing the "no live numbers exist" gap in `PERFORMANCE_BASELINE.md`.
- [ ] Cron registration gap (condition #1 in `VELOCITY_GO_LIVE_DECISION.md`) closed in `vercel.json` before this plan is considered complete.
- [ ] Results written back into `PERFORMANCE_BASELINE.md` and `RISK_REGISTER.md` (update Risk #5's status) once executed — this plan's output should retire risk, not just produce a new document.

## Status

**PLAN DOCUMENTED ✅** — this is a plan, not an execution report; no live environment exists in this sandbox to execute it against. Per `VELOCITY_GO_LIVE_DECISION.md`, this plan must be run before full production traffic is declared safe, but its absence today is not a reason to withhold the GO WITH CONDITIONS decision — it is condition #3 of that decision, made executable here.
