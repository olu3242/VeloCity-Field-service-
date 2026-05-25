# VeloCity Runtime Verification Report
**Date:** 2026-05-25
**Branch:** claude/build-velocity-field-service-JVoOY
**Verifier:** Claude Code (claude-sonnet-4-6)
**Methodology:** Static code analysis across all API routes, handler files, agents, and DB layer.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ COMPLETE | Fully implemented and wired end-to-end |
| ⚠️ PARTIAL | Implemented but with gaps or not fully wired |
| ❌ MISSING | Not implemented |

---

## Flow 1: Provider Approval

**Trigger:** Admin clicks "Approve" on the provider detail page → `POST /api/admin/providers/[id]/approve`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | `src/app/api/admin/providers/[id]/approve/route.ts` |
| GABRIEL screening | ✅ | Calls `governance.checkGovernance()` with `provider_approval` action |
| DB update (`providers.status = "active"`) | ✅ | Sets status + `approved_at` + `approved_by` |
| Event emitted | ⚠️ | No explicit `provider_approved` event emitted; governance writes audit_log but no automation event |
| Queue entry created | ❌ | No queue entry — provider approval has no downstream automation trigger |
| Worker processes | ❌ | N/A — no queue entry |
| Audit log created | ✅ | `audit_logs` insert with `actor_id`, `action: "approve_provider"`, `resource_id` |
| Notification generated | ⚠️ | No notification to provider; only GABRIEL audit. Provider has no in-app notification of approval. |
| Admin visible | ✅ | Admin triggered the action; audit log confirms it |

**Overall Status: ⚠️ PARTIAL**

**Gap:** Provider is never notified of approval (no notification emitted). Provider approval does not trigger downstream onboarding events (e.g., welcome message, first dispatch eligibility check).

---

## Flow 2: Provider Suspension

**Trigger:** Admin clicks "Suspend" on provider detail → `POST /api/admin/providers/[id]/suspend` (or status update via providers API)

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ⚠️ | Suspension logic exists in providers API; dedicated suspend route needs verification |
| Event emitted | ❌ | No `provider_suspended` event type in the event registry |
| Queue entry created | ❌ | No queue entry |
| Worker processes | ❌ | N/A |
| Audit log created | ⚠️ | Depends on which code path is hit; governance.ts logs if called |
| Notification generated | ❌ | No notification to provider or admin |
| Admin visible | ⚠️ | Visible in provider list; no dedicated suspension activity log |

**Overall Status: ⚠️ PARTIAL**

**Gap:** `provider_suspended` is defined as a `NotificationType` in `contracts/notifications.ts` but does NOT exist as an `AutomationEventType`. Provider suspension has no automated downstream effects (e.g., reassigning in-progress jobs, freezing payouts, notifying affected customers).

---

## Flow 3: Dispute Creation → IVY Handler

**Trigger:** Customer or provider submits a dispute → `POST /api/disputes` → `emitEvent("dispute_opened", ...)`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | `/api/disputes/route.ts` exists |
| Event emitted | ✅ | `emitEvent("dispute_opened", ...)` called in disputes API |
| Queue entry created | ✅ | `automation_queue` insert in `emitEvent()` |
| Worker processes | ⚠️ | Router has `case "dispute_opened"` → calls `runAgent(ivy, ...)` directly. Does NOT call `handleIvyDispute()` from handlers/ivy-dispute.ts |
| Audit log created | ✅ | Router writes GABRIEL audit log (wrong agent name — logs as GABRIEL, not IVY) |
| Payout freeze | ❌ | `handlers/ivy-dispute.ts` freezes payout, but this handler is not called from router — payout remains unfrozen |
| Notification generated | ⚠️ | Router does not send notifications. `handlers/ivy-dispute.ts` does, but is not called. Admin notification uses literal `user_id: "admin"` (FK violation risk) |
| Admin visible | ⚠️ | Dispute appears in disputes list. No admin alert pushed. |

**Overall Status: ⚠️ PARTIAL**

**Critical Gap:** The IVY dispute handler (`handlers/ivy-dispute.ts`) is NOT wired into the router. The payout freeze, IVY AI analysis, and dispute notifications only happen if the handler is called — which it currently is not. Events go through `runAgent(ivy, ...)` directly, which runs AI analysis but does NOT freeze payouts or send structured notifications.

---

## Flow 4: Dispute Resolution

**Trigger:** Admin resolves a dispute → updates dispute record → `emitEvent("dispute_resolved", ...)`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | Admin disputes page + API |
| Event emitted | ✅ | `dispute_resolved` is in event registry |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ⚠️ | Router calls `runAgent(ivy, ...)` — same gap as Flow 3 |
| Payout unfreeze | ❌ | Only in `handlers/ivy-dispute.ts` (not wired) |
| Refund issued | ❌ | Only in `handlers/ivy-dispute.ts` (not wired) |
| Audit log created | ✅ | Router GABRIEL audit log |
| Notification generated | ❌ | Not sent (handler not wired) |
| Admin visible | ✅ | Dispute status visible in admin panel |

**Overall Status: ⚠️ PARTIAL**

---

## Flow 5: Job Completion → REX Trust Update

**Trigger:** Provider marks job complete → `POST /api/jobs/[id]/transition` with `to_status: "completed"` → `emitEvent("job_completed", ...)`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | Job transition API |
| Event emitted | ✅ | `job_completed` emitted |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ⚠️ | Router calls `runAgent(nova, ...)` + `runAgent(rex, ...)` + `runAgent(lena, ...)`. `handlers/rex-completion.ts` NOT called. |
| REX trust score update | ⚠️ | REX agent runs (AI call) but does not write to `providers.trust_score` — that write only happens in `handlers/rex-completion.ts` |
| Review request generated | ⚠️ | `handlers/rex-completion.ts` sends review request notification — not called, so notification is not sent |
| LENA retention trigger | ⚠️ | LENA agent runs (AI call) but retention DB writes not executed |
| Audit log created | ✅ | Router GABRIEL audit log |
| Notification generated | ❌ | Job completion notification to customer not sent (only in handler) |
| Admin visible | ✅ | Job status updated in DB; visible in admin jobs list |

**Overall Status: ⚠️ PARTIAL**

**Gap:** REX runs its AI analysis but the trust score is not written back to the DB. The `providers.trust_score` field is only updated inside `handlers/rex-completion.ts` which is not wired.

---

## Flow 6: Customer Review Submission

**Trigger:** Customer submits review → `POST /api/reviews`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | `src/app/api/reviews/route.ts` exists |
| Review saved to DB | ✅ | `reviews` table insert |
| Event emitted | ⚠️ | `review_requested` is the event type, but this is a prompt event not a submission event. After submission, no event is emitted. |
| Queue entry created | ❌ | No automation triggered by review submission |
| REX processing | ❌ | REX trust score update on review not automated |
| Provider notification | ⚠️ | Provider may get a notification (depends on reviews API implementation details) |
| Admin visible | ✅ | Reviews visible in admin and provider pages |

**Overall Status: ⚠️ PARTIAL**

**Gap:** Review submission should trigger a `review_submitted` event → REX trust update. Currently no such event type exists. REX trust score is not updated when a new review comes in (only after job completion, and even that is broken — see Flow 5).

---

## Flow 7: Tip Submission → FINN/LENA/REX/GABRIEL

**Trigger:** Customer submits tip → `POST /api/tips` → emits `tip_submitted`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | `src/app/api/tips/route.ts` exists |
| Stripe payment intent | ✅ | PaymentIntent created for tip amount |
| Stripe webhook confirmation | ✅ | `payment_intent.succeeded` with `metadata.tip === "true"` → updates `provider_tips.payment_status → "succeeded"` + emits `tip_submitted` |
| Event emitted | ✅ | `tip_submitted` emitted from Stripe webhook |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ❌ | Router has NO `case "tip_submitted"` — falls to GABRIEL default. `handlers/tip-submitted.ts` is NOT called. |
| GABRIEL audit | ⚠️ | Generic GABRIEL governance call runs (not the structured audit in tip-submitted.ts) |
| REX trust bump | ❌ | Not executed (handler not called) |
| FINN reconciliation | ❌ | Not executed (handler not called) |
| LENA campaign | ❌ | Not executed (handler not called) |
| Provider notification | ❌ | Not sent (handler not called) |
| Review nudge | ❌ | Not sent (handler not called) |
| Audit log created | ✅ | Generic GABRIEL audit log written by router |

**Overall Status: ⚠️ PARTIAL**

**Critical Gap:** The router has no `case "tip_submitted"`. The fully-built 4-agent tip handler is unreachable. The Stripe webhook correctly emits the event, but the router silently routes it to a generic GABRIEL call.

---

## Flow 8: Payout Lifecycle

**Trigger:** Job confirmed → payout queued → Stripe transfer → payout released

| Step | Implemented? | Notes |
|------|-------------|-------|
| Payout queue creation | ⚠️ | `handlers/finn-payment.ts` creates payout queue entry — but this handler is NOT called from router |
| `payout_queued` event emitted | ✅ | Emitted when payout is queued |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ⚠️ | Router calls `runAgent(finn, ...)` for payout events — `handlers/payout-release.ts` NOT called |
| Stripe transfer executed | ⚠️ | `payout-release.ts` calls Stripe transfer API — not executed from router |
| `payout_released` event emitted | ✅ | Stripe `transfer.created` webhook emits `payout_released` |
| Provider notification | ❌ | Only in `handlers/payout-release.ts` (not called) |
| Audit log created | ✅ | Router GABRIEL audit log |
| Admin visible | ✅ | Payout records visible in admin |

**Overall Status: ⚠️ PARTIAL**

**Gap:** Payout release is the most critical flow. `handlers/payout-release.ts` executes the actual Stripe transfer via `stripe.transfers.create()`. This handler is NOT called from the router. Payouts are computed but not executed.

---

## Flow 9: Stripe Webhook → Tip Auto-Confirm

**Trigger:** Stripe sends `payment_intent.succeeded` for a tip payment

| Step | Implemented? | Notes |
|------|-------------|-------|
| Webhook received | ✅ | `/api/webhooks/stripe` POST route |
| Signature verified | ✅ | `constructWebhookEvent()` validates HMAC |
| Tip detection | ✅ | `intent.metadata?.tip === "true"` check |
| `provider_tips` status update | ✅ | `payment_status → "succeeded"` updated |
| Tip record fetched | ✅ | `provider_tips` queried for full record |
| `tip_submitted` event emitted | ✅ | With full metadata: tip_id, provider_id, amount_cents, job_id |
| Deduplication | ✅ | `dedupKey: "tip_succeeded:{intent.id}"` |
| Queue entry created | ✅ | Via emitEvent() |
| Worker routes event | ❌ | No `case "tip_submitted"` in router — falls to GABRIEL default |

**Overall Status: ⚠️ PARTIAL**

**Note:** The Stripe webhook side is fully correct. The gap is in the router, not the webhook. This is the best-wired flow in the payment domain.

---

## Flow 10: Notification Delivery → Bell Reads from DB

**Trigger:** Any automation event creates a notification → `notifications` table → user opens bell

| Step | Implemented? | Notes |
|------|-------------|-------|
| Notification written to DB | ⚠️ | Written by handler files — but most handlers are not called (see handler wiring gap) |
| `GET /api/notifications?limit=N` | ✅ | Returns `{ data: Notification[] }` with `read` field mapped from `is_read` |
| NotificationBell component fetch | ✅ | Component calls `/api/notifications?limit=10` |
| `PATCH /api/notifications` body `mark_all_read: true` | ✅ | Marks all unread as read; updates `is_read` + `read_at` |
| `PATCH /api/notifications` body `{ id }` | ✅ | Marks single notification as read |
| Unread count displayed | ✅ | Bell shows count of unread notifications |
| Real-time push | ❌ | No Supabase Realtime subscription; user must manually refresh or wait for polling interval |
| Email/SMS delivery | ❌ | Only in-app; email/SMS channels not implemented |

**Overall Status: ⚠️ PARTIAL**

**Note:** The notifications API is well-implemented (GET/PATCH, proper field mapping, limit support). The gap is (a) most notifications never get written because handlers are not wired, and (b) no real-time push.

---

## Flow 11: SLA Breach → Escalation

**Trigger:** Cron (`/api/cron/sla`) detects SLA breach → emits `sla_breach` or `sla_escalate` → router handles

| Step | Implemented? | Notes |
|------|-------------|-------|
| Cron trigger | ✅ | `/api/cron/sla/route.ts` runs SLA check every minute (via Vercel cron or external scheduler) |
| SLA detection | ✅ | `sla.ts` detectsSLA breaches by job status + elapsed time thresholds |
| `sla_warn`/`sla_breach`/`sla_escalate` events emitted | ✅ | Events emitted with dedup keys |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ⚠️ | Router calls `runAgent(nova, ...)` for SLA events — `handlers/sla-check.ts` NOT called from router |
| Job redispatch on breach | ❌ | `handlers/sla-check.ts` triggers redispatch — not executed |
| Admin escalation notification | ❌ | `handlers/sla-check.ts` sends admin notification — not executed |
| Audit log created | ✅ | Router GABRIEL audit log |
| Admin visible | ✅ | Job status + SLA indicators visible in admin job detail |

**Overall Status: ⚠️ PARTIAL**

**Gap:** SLA breach detection works correctly. The response (redispatch, admin escalation) is implemented in `handlers/sla-check.ts` but not executed because the handler is not wired into the router.

---

## Flow 12: New Job Booking → ALICE → MAX Dispatch

**Trigger:** Customer completes booking → `POST /api/jobs` → `emitEvent("service_request_created", ...)`

| Step | Implemented? | Notes |
|------|-------------|-------|
| UI/API trigger | ✅ | Jobs API + booking flow |
| Event emitted | ✅ | `service_request_created` emitted with job metadata |
| Queue entry created | ✅ | Via emitEvent() |
| Worker processes | ⚠️ | Router calls `runAgent(alice, ...)` — `handlers/alice-intake.ts` NOT called |
| ALICE serviceability check | ⚠️ | ALICE AI runs (classifies category/urgency) but does NOT update job DB or emit `serviceability_passed` |
| `serviceability_passed` → MAX dispatch | ❌ | `handlers/alice-intake.ts` emits this event after DB update; since handler not called, MAX is never triggered |
| Provider offer creation | ❌ | `handlers/max-dispatch.ts` creates offers — not called because alice-intake doesn't chain to it |
| Customer notification | ❌ | "Provider matched" notification not sent |
| Audit log created | ✅ | Router GABRIEL audit log |
| Admin visible | ✅ | Job appears in admin with initial status |

**Overall Status: ⚠️ PARTIAL**

**Critical Gap:** The entire ALICE → MAX dispatch chain is broken. ALICE AI runs (returns analysis) but does not update the job status or emit `serviceability_passed`. MAX is never called. No offers are created. The booking flow results in a job stuck in "pending" status with no provider assigned.

---

## Summary Matrix

| Flow | UI/API | Event | Queue | Worker | Audit | Notification | Admin | Status |
|------|--------|-------|-------|--------|-------|--------------|-------|--------|
| 1. Provider approval | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 2. Provider suspension | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ PARTIAL |
| 3. Dispute → IVY | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ PARTIAL |
| 4. Dispute resolution | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 5. Job completion → REX | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 6. Customer review | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ PARTIAL |
| 7. Tip → FINN/LENA/REX | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ⚠️ PARTIAL |
| 8. Payout lifecycle | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 9. Stripe webhook tip | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 10. Notification bell | ✅ | ⚠️ | N/A | N/A | N/A | ⚠️ | ✅ | ⚠️ PARTIAL |
| 11. SLA breach | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |
| 12. Booking → ALICE → MAX | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ PARTIAL |

---

## Root Cause of All ⚠️ PARTIAL Flows

**One systemic bug causes 10 of the 12 partial flows:** The router (`src/lib/automation/router.ts`) calls agents via `runAgent()` directly instead of dispatching to the 13 handler files in `handlers/`. The handlers contain all the DB writes, event chaining, notifications, and Stripe API calls. Without wiring the router to the handlers, events are "processed" in name only — the AI runs, but nothing changes in the database.

**Fix:** Add imports for each handler file and replace inline `runAgent()` calls with handler dispatch (see `AUTOMATION_IMPLEMENTATION_PLAN.md` Wave 2 for exact code).

**Estimated effort:** 4-6 hours of implementation + testing. All handler files are already written and have correct interfaces.
