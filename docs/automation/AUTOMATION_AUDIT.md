# VeloCity Automation Audit
**Date:** 2026-05-23
**Branch:** claude/build-velocity-field-service-JVoOY
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Executive Summary

VeloCity's automation infrastructure is substantially built and architecturally sound: the event emission pipeline, queue worker, router, all 10 AI agents, and the majority of event handlers are implemented and functional. The system correctly separates concerns between event emission (`emitEvent`), queuing (`automation_queue`), routing (`router.ts`), and agent execution (`runAgent`). The primary gaps are a type divergence between two `AutomationEventType` definitions, missing handler dispatch wiring in the router (handlers exist but the router uses agents directly), and several Stripe webhook cases that emit events but have no dedicated handlers.

---

## System Inventory

| System | Status | Location | Notes |
|--------|--------|----------|-------|
| emitEvent | BUILT | `src/lib/automation/emitEvent.ts` | Dual overload API, idempotency via `dedup_key`, tenant isolation |
| worker | BUILT | `src/lib/automation/worker.ts` | Polling, CAS-style status updates, 3-attempt retry with exponential backoff |
| router | PARTIAL | `src/lib/automation/router.ts` | Calls agents directly via `runAgent` — does NOT dispatch to the handler files in `handlers/` |
| handlers/alice-intake | BUILT | `src/lib/automation/handlers/alice-intake.ts` | ALICE → serviceability → DB update → emit next event |
| handlers/max-dispatch | BUILT | `src/lib/automation/handlers/max-dispatch.ts` | MAX → provider ranking → offer creation → notifications |
| handlers/nova-workflow | BUILT | `src/lib/automation/handlers/nova-workflow.ts` | NOVA → state transition analysis → customer/provider notifications |
| handlers/quinn-quote | BUILT | `src/lib/automation/handlers/quinn-quote.ts` | QUINN → pricing analysis → quote DB update → customer notification |
| handlers/finn-payment | BUILT | `src/lib/automation/handlers/finn-payment.ts` | FINN → payout queue creation → payment failure handling |
| handlers/ivy-dispute | BUILT | `src/lib/automation/handlers/ivy-dispute.ts` | IVY → payout freeze → dispute AI analysis → notifications |
| handlers/rex-completion | BUILT | `src/lib/automation/handlers/rex-completion.ts` | REX → trust score update → review request → LENA retention trigger |
| handlers/lena-retention | BUILT | `src/lib/automation/handlers/lena-retention.ts` | LENA → retention campaign → provider scoring |
| handlers/tess-territory | BUILT | `src/lib/automation/handlers/tess-territory.ts` | TESS → market analysis → audit log |
| handlers/sla-check | BUILT | `src/lib/automation/handlers/sla-check.ts` | SLA warn/breach/escalate → redispatch → admin escalation |
| handlers/payout-release | BUILT | `src/lib/automation/handlers/payout-release.ts` | Stripe transfer → payout_queue management → retry logic |
| handlers/provider-offer | BUILT | `src/lib/automation/handlers/provider-offer.ts` | Offer audit log (thin — primary notification in max-dispatch) |
| handlers/tip-submitted | BUILT | `src/lib/automation/handlers/tip-submitted.ts` | Multi-agent: GABRIEL + REX + FINN + LENA + notification + review nudge |
| ALICE agent | BUILT | `src/lib/agents/alice.ts` | Intake & classification; fallback deterministic classifier |
| MAX agent | BUILT | `src/lib/agents/max.ts` | Dispatch & provider matching; fallback trust-score ranking |
| QUINN agent | BUILT | `src/lib/agents/quinn.ts` | Quote & pricing validation; fallback line-item arithmetic check |
| NOVA agent | BUILT | `src/lib/agents/nova.ts` | Job workflow orchestration; fallback allowed=true |
| REX agent | BUILT | `src/lib/agents/rex.ts` | Quality & trust monitoring |
| IVY agent | BUILT | `src/lib/agents/ivy.ts` | Dispute resolution |
| FINN agent | BUILT | `src/lib/agents/finn.ts` | Finance & payment monitoring |
| LENA agent | BUILT | `src/lib/agents/lena.ts` | Customer retention & rebooking |
| TESS agent | BUILT | `src/lib/agents/tess.ts` | Territory & market intelligence |
| GABRIEL agent | BUILT | `src/lib/agents/gabriel.ts` | Governance & compliance; provider screening |
| runAgent | BUILT | `src/lib/agents/runAgent.ts` | Centralized runner; supports agent instance or AgentName string |
| base-agent | BUILT | `src/lib/agents/base.ts` | Anthropic client lifecycle, JSON parsing, agent_logs write |
| SLA monitor | BUILT | `src/lib/automation/sla.ts` | 6-status SLA thresholds; detectStuckJobs; detectExpiredOffers; processReadyPayouts |
| growthEvents | BUILT | `src/lib/automation/growthEvents.ts` | Growth signal typing + routing metadata |
| governance | BUILT | `src/lib/automation/governance.ts` | Hard-coded policy rules + GABRIEL AI check + audit_logs write |
| Stripe webhook | PARTIAL | `src/app/api/webhooks/stripe/route.ts` | 7 event types handled; missing: `charge.dispute.updated`, `account.external_account.*`, payout events |
| Cron: sla | BUILT | `src/app/api/cron/sla/route.ts` | Every-minute: SLA check + stuck jobs + expired offers + queue drain |
| Cron: daily | BUILT | `src/app/api/cron/daily/route.ts` | 3 AM: territory_analysis, provider_scoring, retention_campaign |
| Cron: payouts | BUILT | `src/app/api/cron/payouts/route.ts` | Hourly: processReadyPayouts + queue drain |
| Cron: automation | BUILT | `src/app/api/cron/automation/route.ts` | Comprehensive: expired offers, SLA breaches, stuck jobs, failed payments, unsent notifications, payouts |
| Cron: daily-intelligence | BUILT | `src/app/api/cron/daily-intelligence/route.ts` | Richer daily: territory + per-provider scoring + per-customer retention + franchise signal |
| Admin automation process | BUILT | `src/app/api/admin/automation/process/route.ts` | Auth-gated admin queue drain with RBAC check |
| Automation emit | BUILT | `src/app/api/automation/emit/route.ts` | Admin-only manual event emission |
| Automation status | BUILT | `src/app/api/automation/status/route.ts` | Dashboard stats: queue counts, recent runs, recent events, pending payouts |
| automation/process | BUILT | `src/app/api/automation/process/route.ts` | CRON_SECRET-gated queue processor |
| Notifications | PARTIAL | `src/app/api/notifications/route.ts` | DB read/write exists; no real-time push; no email/SMS delivery |
| Reviews API | BUILT | `src/app/api/reviews/route.ts` | Exists; UI display unknown |
| Tips API | BUILT | `src/app/api/tips/route.ts` | tip_submitted handler fully implemented |
| Jobs API | BUILT | `src/app/api/jobs/` | CRUD + transition endpoint |
| Quotes API | BUILT | `src/app/api/quotes/` | CRUD + individual quote operations |
| Disputes API | BUILT | `src/app/api/disputes/route.ts` | Exists |
| Payments intent | BUILT | `src/app/api/payments/intent/route.ts` | Stripe PaymentIntent creation |
| Providers API | BUILT | `src/app/api/providers/` | CRUD + status management |
| Offers API | BUILT | `src/app/api/offers/[id]/route.ts` | Offer accept/reject |
| Admin dispatch | BUILT | `src/app/api/admin/dispatch/route.ts` | Manual admin dispatch trigger |
| Admin provider approve | BUILT | `src/app/api/admin/providers/[id]/approve/route.ts` | Provider approval with GABRIEL screening |
| Admin Supabase client | BUILT | `src/lib/supabase/admin.ts` | Singleton service-role client with placeholder guard |
| Type definitions (automation.ts/lib) | DUPLICATED | `src/types/automation.ts` + `src/lib/automation/types.ts` | Two different definitions of AutomationEventType with different event sets |

---

## Event Pipeline Coverage

| Event Type | Router Handler | Dedicated Handler File | Status |
|------------|---------------|------------------------|--------|
| `service_request_created` | ALICE via runAgent | `handlers/alice-intake.ts` | PARTIAL — router uses runAgent directly; handler file exists but not wired into router |
| `serviceability_passed` | ALICE via runAgent | `handlers/alice-intake.ts` (emits this) | PARTIAL — same disconnect |
| `serviceability_failed` | ALICE via runAgent | — | OK via router |
| `provider_offer_sent` | MAX via runAgent | `handlers/provider-offer.ts` | PARTIAL — offer.ts only does audit log |
| `provider_offer_expired` | MAX via runAgent | — | OK via router |
| `job_reassigned` | MAX via runAgent | — | OK via router |
| `no_provider_accepted` | MAX via runAgent | `handlers/sla-check.ts` (handles this) | PARTIAL — also handled in sla-check |
| `job_accepted` | NOVA via runAgent | `handlers/nova-workflow.ts` | PARTIAL — router calls runAgent; handler file exists but not wired |
| `job_state_changed` | NOVA via runAgent | `handlers/nova-workflow.ts` | PARTIAL |
| `job_started` | NOVA via runAgent | — | OK via router |
| `job_completed` | NOVA + REX + LENA via runAgent | `handlers/rex-completion.ts` | PARTIAL — router does multi-agent; rex-completion.ts also handles this independently |
| `customer_confirmed` | NOVA + REX + LENA via runAgent | `handlers/rex-completion.ts` | PARTIAL |
| `sla_breach_detected` | NOVA via runAgent | — | OK via router |
| `stuck_job_detected` | NOVA via runAgent | — | OK via router |
| `sla_warn` | NOVA via runAgent | `handlers/sla-check.ts` | PARTIAL — duplicate handling path |
| `sla_breach` | NOVA via runAgent | `handlers/sla-check.ts` | PARTIAL — duplicate handling path |
| `sla_escalate` | NOVA via runAgent | `handlers/sla-check.ts` | PARTIAL — duplicate handling path |
| `job_stuck` | NOVA via runAgent | `handlers/sla-check.ts` | PARTIAL — duplicate handling path |
| `provider_late` | NOVA via runAgent | `handlers/sla-check.ts` | PARTIAL — duplicate handling path |
| `quote_submitted` | QUINN via runAgent | `handlers/quinn-quote.ts` | PARTIAL — not wired |
| `quote_validated` | QUINN via runAgent | — | OK via router |
| `quote_flagged` | QUINN via runAgent | — | OK via router |
| `quote_approved` | QUINN via runAgent | `handlers/finn-payment.ts` | PARTIAL — finn-payment handles finance side; router also calls QUINN |
| `quote_rejected` | QUINN via runAgent | — | OK via router |
| `change_order_submitted` | QUINN via runAgent | — | OK via router |
| `payment_authorized` | FINN via runAgent | — | OK via router |
| `payment_captured` | FINN via runAgent | `handlers/finn-payment.ts` | PARTIAL |
| `payment_failed` | FINN via runAgent | `handlers/finn-payment.ts` | PARTIAL |
| `failed_payment_retry` | FINN via runAgent | — | OK via router |
| `payout_queued` | FINN via runAgent | `handlers/payout-release.ts` | PARTIAL |
| `payout_hold` | FINN via runAgent | — | OK via router |
| `payout_released` | FINN via runAgent | `handlers/payout-release.ts` | PARTIAL |
| `payout_failed` | FINN via runAgent | `handlers/payout-release.ts` | PARTIAL |
| `payout_retry_scheduled` | FINN via runAgent | — | OK via router |
| `refund_requested` | FINN via runAgent | — | OK via router |
| `refund_issued` | FINN via runAgent | — | OK via router |
| `chargeback_opened` | FINN via runAgent | — | OK via router |
| `dispute_opened` | IVY via runAgent | `handlers/ivy-dispute.ts` | PARTIAL |
| `dispute_resolved` | IVY via runAgent | `handlers/ivy-dispute.ts` | PARTIAL |
| `review_requested` | REX via runAgent | — | OK via router |
| `subscription_due` | LENA via runAgent | — | OK via router |
| `warranty_callback_due` | LENA via runAgent | — | OK via router |
| `retention_campaign` | LENA via runAgent | `handlers/lena-retention.ts` | PARTIAL |
| `retention_campaign_due` | LENA via runAgent | — | OK via router |
| `provider_scoring` | REX via runAgent | `handlers/lena-retention.ts` (handles this!) | PARTIAL — mismatch: lena-retention.ts handles provider_scoring event |
| `provider_scoring_due` | REX via runAgent | — | OK via router |
| `daily_territory_analysis` | TESS via runAgent | `handlers/tess-territory.ts` | PARTIAL |
| `high_demand_area_detected` | TESS via runAgent | — | OK via router |
| `provider_shortage_detected` | TESS via runAgent | — | OK via router |
| `surge_pricing_recommended` | TESS via runAgent | — | OK via router |
| `recurring_service_opportunity_detected` | TESS via runAgent | — | OK via router |
| `provider_subscription_opportunity_detected` | TESS via runAgent | — | OK via router |
| `customer_churn_risk_detected` | TESS via runAgent | — | OK via router |
| `territory_ready_for_expansion` | TESS via runAgent | — | OK via router |
| `franchise_candidate_area_detected` | TESS via runAgent | — | OK via router |
| `failed_notification_retry` | GABRIEL (default) | — | Unhandled — falls to default governance audit |
| `tip_submitted` | GABRIEL (default) | `handlers/tip-submitted.ts` | PARTIAL — not wired in router; has no `tip_submitted` case in router switch |
| `agent_run` | GABRIEL (default) | — | Unhandled — falls to default |

**Key Finding:** The `router.ts` switch statement handles all events by calling agents via `runAgent` directly. The 13 handler files in `handlers/` represent an **independent, richer** processing path that is NOT wired into the router — they are effectively unreachable from the event pipeline as currently coded.

---

## AI Agent Coverage

| Agent | Name | Trigger Events (via router) | Primary Action | Output Logged |
|-------|------|--------------------------|----------------|---------------|
| ALICE | Customer Intake | `service_request_created`, `serviceability_passed`, `serviceability_failed` | Classifies category/urgency/complexity; determines serviceability | `agent_logs` via BaseAgent.log |
| MAX | Dispatch | `provider_offer_sent`, `provider_offer_expired`, `job_reassigned`, `no_provider_accepted` | Ranks providers by multi-factor score; recommends dispatch strategy | `agent_logs` |
| QUINN | Quote & Pricing | `quote_submitted`, `quote_validated`, `quote_flagged`, `change_order_submitted`, `quote_approved`, `quote_rejected` | Validates pricing fairness; detects overcharge | `agent_logs` |
| NOVA | Workflow | `job_accepted`, `job_state_changed`, `job_started`, `job_completed`, `customer_confirmed`, all SLA events | Validates state transitions; generates notifications; sets SLA deadlines | `agent_logs` |
| REX | Quality & Trust | `job_completed`, `customer_confirmed`, `review_requested`, `provider_scoring`, `provider_scoring_due` | Calculates dynamic trust scores; detects review fraud | `agent_logs` |
| IVY | Disputes | `dispute_opened`, `dispute_resolved` | Mediates disputes; recommends refund split | `agent_logs` |
| FINN | Finance | All payment events, all payout events, refund/chargeback | Evaluates payout timing; reconciles revenue | `agent_logs` |
| LENA | Retention | `subscription_due`, `warranty_callback_due`, `retention_campaign`, `retention_campaign_due` | Predicts rebook needs; churn risk scoring | `agent_logs` |
| TESS | Territory | All territory/growth events, `daily_territory_analysis` | Supply/demand analysis; surge pricing; expansion signals | `agent_logs` + `audit_logs` |
| GABRIEL | Governance | All unmatched events (default case) + governance.ts integration | Policy compliance; provider screening; audit trail | `agent_logs` + `audit_logs` |

**All agents:** AI calls through single `BaseAgent.run()` → Anthropic claude-sonnet-4-20250514. All have fallback logic when `ANTHROPIC_API_KEY` is missing. All log to `agent_logs` table. GABRIEL also writes to `audit_logs` in governance.ts.

---

## Infrastructure Gaps

### G1: Router Does Not Dispatch to Handler Files
**Critical.** `router.ts` implements its own agent-calling logic inline. The 13 handler files (`handlers/*.ts`) are fully implemented but the router never imports or calls them. Events go through `runAgent` in the router (basic) rather than through the handlers (which do richer work: DB updates, multi-step orchestration, proper event chaining).

### G2: Dual AutomationEventType Definitions
`src/types/automation.ts` defines 28 event types.
`src/lib/automation/types.ts` defines 57 event types.
These are **not the same set** — `types/automation.ts` includes `tip_submitted` and `agent_run` but is missing growth events; `lib/automation/types.ts` has the full set but lacks `tip_submitted` and `agent_run`. Any file importing from the wrong location gets incomplete types.

### G3: tip_submitted Not Routed
`router.ts` has no `case "tip_submitted"` — it falls to the GABRIEL default case. The full `handlers/tip-submitted.ts` (GABRIEL + REX + FINN + LENA + review nudge) is never invoked.

### G4: failed_notification_retry Has No Handler
This event is emitted by `cron/automation` but falls to the default GABRIEL case. No actual notification retry logic exists.

### G5: No CAS Locking in Worker
The worker sets `status = "processing"` then runs the handler — but there is no SELECT FOR UPDATE or atomic compare-and-swap. Under concurrent cron invocations, the same queue item can be picked up twice. PostgreSQL's `FOR UPDATE SKIP LOCKED` is the standard fix.

### G6: GABRIEL Router Audit Log — Wrong Agent Name
In `router.ts` line 146, GABRIEL is always inserted into `agent_logs` regardless of which agent actually handled the event. The `agent_name` field reads `"GABRIEL"` even when ALICE handled the event.

### G7: Payout Release Recursion
`handlers/payout-release.ts` emits `payout_released` event on success (line 96) — from within the `payout_released` handler. This creates a self-referential loop. The dedup key prevents infinite loops but wastes queue cycles.

### G8: No Token Cost Tracking
`BaseAgent.log` records `tokens_used` and `latency_ms` per agent run, but there is no aggregation, budget enforcement, or cost alerting. Daily AI spend is invisible.

### G9: Stripe Missing Webhook Cases
Unhandled Stripe events: `charge.dispute.updated`, `charge.dispute.closed`, `customer.subscription.deleted`, `payout.failed`, `payout.paid`, `account.external_account.created`. These affect financial state but are silently dropped.

### G10: Admin Notification in ivy-dispute Uses Placeholder
`handlers/ivy-dispute.ts` line 77 inserts a notification with `user_id: "admin"` — a string literal, not a real user UUID. This notification will fail foreign key constraints in production.

### G11: Duplicate Cron Overlap
`cron/sla` and `cron/automation` both: detect expired offers, detect stuck jobs, and drain the queue. Running both on the same schedule produces duplicate events (despite dedup keys mitigating effects).

### G12: lena-retention.ts Handles provider_scoring
The `handleLenaRetention` function checks `item.event_type === "provider_scoring"` to run provider scoring logic. This is misnamed — provider scoring logically belongs in a rex handler.

### G13: getAdminClient Singleton Not Thread-Safe for Tests
The module-level `_adminClient` singleton in `admin.ts` will persist across test runs in Jest with module caching, causing test pollution.

### G14: provider_offer_sent Handler Is Thin
`handlers/provider-offer.ts` only writes an audit log. The primary notification already happens in `handlers/max-dispatch.ts`. This handler adds no value as currently written.

---

## Security Observations

1. **CRON_SECRET enforcement is optional.** In `cron/sla/route.ts` and `cron/daily/route.ts`, if `CRON_SECRET` is not set, all requests are allowed. This means development/staging with no secret set is fully open.

2. **Admin routes use proper RBAC.** `admin/automation/process` checks `role === "admin"` + `checkPermission()` — good.

3. **Stripe webhook signature verified** via `constructWebhookEvent` before processing — good.

4. **`(event.data.object as any)` in Stripe webhook.** Casting to `any` bypasses TypeScript safety for financial data. Should use Stripe SDK typed objects.

5. **No rate limiting on `/api/automation/emit`.** Admin-only but no per-user rate limit — a compromised admin account could flood the queue.

6. **Supabase service-role key placeholder check is correct** — throws before returning a useless client.

7. **`runAgent("GABRIEL", ...)` defaults `approved: true` on AI failure** in governance.ts. This means a network error silently allows all state transitions — should default to a stricter posture for high-risk transitions.

---

## Duplicate/Redundant Systems

| Duplication | Description |
|-------------|-------------|
| Two event type definitions | `src/types/automation.ts` vs `src/lib/automation/types.ts` — different event sets |
| Two event handling paths | `router.ts` (simple runAgent calls) vs `handlers/*.ts` (full orchestration) — handlers unreachable |
| Two cron automation routes | `cron/automation` and `cron/sla` overlap significantly in what they detect |
| Two daily intelligence routes | `cron/daily` emits 3 events; `cron/daily-intelligence` emits the same events plus per-entity variants — may double-emit if both run |
| `provider_scoring` handled in lena-retention.ts | Semantic mismatch — scoring logic in retention handler |
| GABRIEL audit log written twice | Once in router.ts (always) and once in governance.ts when governance is invoked |
