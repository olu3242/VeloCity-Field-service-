# Event Traceability Matrix (Batch X, Phase 4)

The real event taxonomy is `AutomationEventType` in `src/lib/automation/types.ts:1-63` (snake_case, 60 event types). The directive's example dot-case names (`booking.created`, `payment.received`, etc.) map onto these real types as shown below. Routing is entirely in `src/lib/automation/router.ts` (`routeAutomationEvent()`); every case traced to file:line.

| Directive example | Real event type (types.ts) | Handler (router.ts) | Agent | Evidence table | Command Center visibility |
|---|---|---|---|---|---|
| `booking.created` | `service_request_created` | router.ts:61-68 → `handleAliceIntake` | ALICE | `agent_logs` | AI Agent Activity table |
| `booking.completed` | `job_completed` | router.ts:96-104 → `handleRexCompletion` + `handleNovaWorkflow` | REX, NOVA | `agent_logs`, `job_status_history` | AI Agent Activity table; job KPIs |
| `provider.approved` | *(no dedicated automation event type — provider approval is a direct route action, not routed through the automation event pipeline)* | GABRIEL governance log fires on the approval API route directly, not via `routeAutomationEvent` | GABRIEL | `audit_logs`/`agent_logs` | Personas/Security card |
| `payment.received` | `payment_captured` | router.ts:125-137 → `handleFinnPayment` | FINN | `agent_logs`, `payment_ledger` | Recent Failed Events card (on failure), payment KPIs |
| `review.received` | `review_requested` (review *request*, not receipt — no `review_received` event type exists in the taxonomy) | router.ts:163-172 → `handleLenaRetention` | LENA | `agent_logs` | AI Agent Activity table |
| `dispute.created` | `dispute_opened` | router.ts:154-160 → `handleIvyDispute` | IVY | `agent_logs`, `audit_logs` | Disputes KPI |
| `workflow.failed` | *(no dedicated event type — handler-level failures are caught generically)* | router.ts:247-257 — catch block on any handler throw, writes `audit_logs` with `handler_error:<eventType>` | — | `audit_logs` | Recent Failed Events card |
| `dispatch.failed` | `no_provider_accepted` | router.ts:71-82 → `handleProviderOffer` + `handleMaxDispatch` | MAX | `agent_logs` | AI Agent Activity table, dispatch KPIs |

## Every routed event type → handler → agent → evidence (full taxonomy, router.ts:59-246)

| Event type(s) | Handler(s) | Agent(s) | Evidence |
|---|---|---|---|
| `service_request_created`, `serviceability_passed`, `serviceability_failed` | `handleAliceIntake` | ALICE | `agent_logs` |
| `provider_offer_sent`, `provider_offer_expired`, `job_reassigned`, `provider_penalty_applied`, `no_provider_accepted` | `handleProviderOffer` + `handleMaxDispatch` | MAX | `agent_logs` |
| `job_accepted`, `job_state_changed`, `job_started`, `provider_arrived` | `handleNovaWorkflow` | NOVA | `agent_logs`, `job_status_history` |
| `job_completed`, `customer_confirmed` | `handleRexCompletion` + `handleNovaWorkflow` | REX, NOVA | `agent_logs`, `job_status_history` |
| `quote_submitted`, `quote_validated`, `quote_flagged`, `change_order_submitted`, `quote_approved`, `quote_rejected` | `handleQuinnQuote` (+ `handleFinnPayment` if `quote_approved`) | QUINN, FINN | `agent_logs`, `pricing_decisions` |
| `payment_authorized`, `payment_captured`, `payment_failed`, `failed_payment_retry`, `failed_notification_retry`, `refund_requested`, `refund_issued`, `chargeback_opened` | `handleFinnPayment` | FINN | `agent_logs`, `payment_ledger`, `refund_records` |
| `payout_queued`, `payout_hold`, `payout_released`, `payout_failed`, `payout_retry_scheduled` | `handlePayoutRelease` + `handleFinnPayment` | FINN | `agent_logs`, `payout_ledger` |
| `dispute_opened`, `dispute_resolved` | `handleIvyDispute` | IVY | `agent_logs`, `audit_logs` |
| `review_requested`, `subscription_due`, `warranty_callback_due`, `retention_campaign`, `retention_campaign_due` | `handleLenaRetention` | LENA | `agent_logs` |
| `provider_scoring`, `provider_scoring_due` | `handleRexCompletion` | REX | `agent_logs`, `providers.trust_score` |
| `sla_breach_detected`, `stuck_job_detected`, `sla_warning`, `sla_warn`, `sla_breach`, `sla_escalate`, `job_stuck`, `provider_late` | `handleSLACheck` | — | `agent_logs`, `audit_logs` (sla-check.ts writes audit_logs 3x) |
| `daily_territory_analysis`, `high_demand_area_detected`, `provider_shortage_detected`, `surge_pricing_recommended`, `recurring_service_opportunity_detected`, `provider_subscription_opportunity_detected`, `customer_churn_risk_detected`, `territory_ready_for_expansion`, `franchise_candidate_area_detected` | `handleTessTerritory` (+ `routeGrowthAutomationEvent` for non-daily types) | TESS | `agent_logs` |
| `tip_submitted` | `handleTipSubmitted` | — | `agent_logs` |
| *(any unmatched type)* | default branch, router.ts:235-245 | GABRIEL | `audit_logs` (`unhandled_event:<type>`) |
| *(every event, regardless of branch taken)* | router.ts:259-269, unconditional | GABRIEL | `agent_logs` ("Governance Audit" action, fires after every processed event — even on handler error) |

## Missing/broken links found

- **`workflow.failed` / `dispatch.failed`-style events have no dedicated event type** — failures are caught generically by the router's `try/catch` (router.ts:247-257) and logged to `audit_logs` as `handler_error:<eventType>`, not as their own first-class event. This means a failure is traceable (via `audit_logs`) but not independently re-routable or re-triggerable as a distinct event — a structural gap, not a bug. No fix applied (would be new automation-taxonomy work, out of scope for a certification batch).
- **`provider.approved` is not in the automation event taxonomy at all** — provider approval is handled directly in its API route, not through `routeAutomationEvent`. GABRIEL's audit logging there is a direct call, not the router's unconditional governance log. This is a real but separate code path from the main event pipeline — documented, not merged (merging would be new integration work).
- **No duplicate handlers found** — every event type maps to exactly one handler set in the switch statement; no two `case` blocks compete for the same event type.

## Conclusion

Every event type in the real taxonomy traces cleanly to a handler, an agent (where applicable), and an evidence table. The two gaps above (`workflow.failed`, `provider.approved`) are pre-existing taxonomy gaps, now documented with file:line precision for the first time. No duplicate handlers exist.
