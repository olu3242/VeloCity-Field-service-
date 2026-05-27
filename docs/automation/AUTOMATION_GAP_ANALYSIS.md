# VeloCity Gap Analysis
**Date:** 2026-05-25 (updated; original: 2026-05-23)
**Branch:** claude/build-velocity-field-service-JVoOY
**Based on:** Full code audit of automation/, agents/, api/ directories

---

## Critical Gaps (P0 — blocks production)

### P0-1: Handler Files Are Unreachable — Router Bypasses Them
**Impact:** All 13 handler files (`handlers/*.ts`) are dead code. Events are processed by the router's inline `runAgent` calls only. This means: DB updates after AI analysis don't happen, event chaining doesn't happen, and the richer orchestration logic (payout queue creation, offer creation, dispute freeze, etc.) never runs.

**Fix:** Update `router.ts` to import and call handler functions for each event type, or implement a handler registry that maps event types to handler functions. The handler files already implement the correct interface (`HandlerResult`).

### P0-2: Dual AutomationEventType Definitions Are Diverged
**Impact:** Files importing from `src/types/automation.ts` (28 events) get a different type than files importing from `src/lib/automation/types.ts` (57 events). The handler files use `src/types/automation.ts`; the router uses `src/lib/automation/types.ts`. TypeScript does not catch cross-module type incompatibilities here because they share the same string values — but the union type check will fail for events only in one definition.

**Fix:** Unify to a single canonical source. The `src/lib/contracts/events.ts` file (Task 5 of this sprint) should become the single source of truth. Both old files should re-export from contracts.

### P0-3: No Queue Concurrency Protection (Missing SELECT FOR UPDATE SKIP LOCKED)
**Impact:** Multiple concurrent cron invocations (e.g., `cron/sla` and `cron/automation` both call `processAutomationQueue`) can pick up the same pending queue item. The `status = "processing"` update is not atomic — two workers can both read `status = "pending"`, both update to "processing", and both execute the handler. This causes double-charges, double-payouts, or double-notifications.

**Fix:** Use a Postgres advisory lock or `FOR UPDATE SKIP LOCKED` in the queue select. In Supabase/PostgREST, use an RPC function for the atomic claim step.

### P0-4: tip_submitted Falls to GABRIEL Default — No Real Handler Invoked
**Impact:** Tips are emitted by the tips API but the router has no `case "tip_submitted"`. The sophisticated `handlers/tip-submitted.ts` (4-agent flow: GABRIEL audit + REX trust bump + FINN reconciliation + LENA campaign + review nudge) never runs. Tips are "handled" by a generic GABRIEL governance prompt that doesn't do any of the above.

**Fix:** Add `case "tip_submitted"` to the router switch statement, wired to `handleTipSubmitted`.

### P0-5: GABRIEL Governance `approved: true` Fails Open on AI Error
**Impact:** When Anthropic API is unavailable, `governance.ts` defaults to `approved: true` for ALL state transitions. A network blip during a high-risk transition (e.g., marking a job completed_pending_confirmation) silently approves it. For financial state machines, fail-open is dangerous.

**Fix:** Define a per-transition risk table. Hard-coded rules already catch the most critical cases. For the GABRIEL AI fallback specifically, default to `approved: true` only for `risk_level: "low"` transitions; for `risk_level: "high"` transitions default to a review queue.

---

## High Priority Gaps (P1 — significant UX/ops impact)

### P1-1: failed_notification_retry Has No Implementation
**Impact:** `cron/automation` emits `failed_notification_retry` for notifications older than 15 minutes with no `sent_at`. This event hits the GABRIEL default case which only does a governance audit log. No actual retry of the notification occurs.

**Fix:** Add a `case "failed_notification_retry"` in the router that marks notifications as sent (or calls the appropriate delivery channel).

### P1-2: Admin Notification Uses Literal "admin" as user_id
**Impact:** `handlers/ivy-dispute.ts` inserts a notification with `user_id: "admin"`. In production with foreign key constraints on `notifications.user_id → profiles.id`, this insert will fail. Dispute notifications to admins are silently lost.

**Fix:** Query the `profiles` table for users with `role = "admin"` and insert one notification per admin user.

### P1-3: Stripe Webhook Missing Dispute Lifecycle Events
**Impact:** `charge.dispute.updated` and `charge.dispute.closed` are not handled. When Stripe updates a dispute status (e.g., customer wins, provider wins), the platform doesn't react. Payouts remain frozen even after Stripe resolves in the provider's favor.

**Fix:** Add handlers for `charge.dispute.updated` (update dispute record + conditionally unfreeze payout) and `charge.dispute.closed`.

### P1-4: Duplicate Cron Routes Causing Double Event Emission
**Impact:** `cron/sla` and `cron/automation` both detect expired offers and stuck jobs. If both are scheduled (e.g., both at 1-minute intervals), each detection fires events twice. Dedup keys reduce the impact but consume extra queue capacity and agent API calls.

**Fix:** Consolidate into one comprehensive cron route. Recommend keeping `cron/automation` (more complete) and deprecating `cron/sla` (or making it SLA-only without the overlap).

### P1-5: Payout Release Handler Emits payout_released From Inside payout_released Handler
**Impact:** Self-referential event emission creates a queue loop. After a successful transfer, the handler emits another `payout_released` event with the same dedup key — which is a no-op due to dedup, but adds unnecessary DB writes and queue items on every payout.

**Fix:** Remove the redundant `emitEvent("payout_released", ...)` call at line 96 of `payout-release.ts`.

### P1-6: No Real-Time Push for Notifications
**Impact:** `notifications` table is written correctly but there is no WebSocket/SSE push to the client. Users only see notifications on page reload. For time-sensitive events (offer expires in 10 min, SLA breach, dispute opened), this is a significant UX gap.

**Fix:** Integrate Supabase Realtime subscriptions on the `notifications` table (client-side listener). Add `sent_at` update logic when notification is actually delivered.

### P1-7: Token Cost Not Tracked or Budgeted
**Impact:** Every router event invokes at least one Anthropic API call (and completion events invoke three: NOVA + REX + LENA). With 57 event types and high job volume, unchecked AI spend is a production risk. Currently `tokens_used` is logged per-run but never aggregated.

**Fix:** Add a daily cost summary job that queries `agent_logs` for `SUM(tokens_used)` by agent and emits an alert if spend exceeds threshold. Implement token budget soft-limits per agent per hour.

---

## Medium Priority (P2 — improvement)

### P2-1: lena-retention.ts Handles provider_scoring — Semantic Mismatch
The `handleLenaRetention` function handles `provider_scoring` events, which involves querying providers, calculating trust scores, and updating them. This logic belongs in a REX handler, not a LENA handler.

**Fix:** Extract provider scoring logic to `handlers/rex-scoring.ts`.

### P2-2: provider_offer_sent Handler Provides No Value Beyond Audit Log
`handlers/provider-offer.ts` writes one audit log entry. The meaningful work (offer creation, provider notification) happens in `handlers/max-dispatch.ts`. This handler should either be deleted or enriched with push notification dispatch.

**Fix:** Enrich with push/SMS notification delivery, or remove and consolidate the audit log into max-dispatch.

### P2-3: GABRIEL Audit Log Written Twice Per Route
`router.ts` unconditionally inserts to `agent_logs` with `agent_name: "GABRIEL"` after every event (line 145-154), even when ALICE or MAX handled it. The actual GABRIEL agent also logs via `BaseAgent.log`. This creates noise and incorrect attribution.

**Fix:** Remove the unconditional GABRIEL log at the bottom of `routeAutomationEvent`. Let each agent's `BaseAgent.log` handle attribution.

### P2-4: Worker Retry Logic Uses `retry_count >= 3` Hard-Coded
The worker retries up to 3 times with `retryCount * 60_000` ms backoff. This is reasonable but should be configurable per event type — financial events may warrant more retries; low-priority growth events fewer.

**Fix:** Add `max_retries` field lookup from queue row (already exists in `AutomationQueueItem.max_retries`) instead of hard-coding 3.

### P2-5: `emitEvents()` Bulk Helper Uses `Promise.allSettled` Without Error Reporting
`emitEvents()` fires all events in parallel and discards errors. Callers have no way to know which events failed to emit.

**Fix:** Return `EmitResult[]` from `emitEvents()` so callers can inspect failures.

### P2-6: BaseAgent Uses `createAdminClient` (Cookie-Based) for Logging
`base.ts` imports `createAdminClient` from `@/lib/supabase/server` for the `log()` function. In cron/automation contexts (no cookie jar), this may fail. Server-side admin logging should use `getAdminClient()` from `@/lib/supabase/admin`.

**Fix:** Replace `createAdminClient()` in `base.ts` with `getAdminClient()` for the logging path.

### P2-7: No Health Check for Anthropic API
`getPlatformHealth` (to be created in contracts/health.ts) marks `ai_runtime: "healthy"` unconditionally. If Anthropic API is down, all agents silently fall back without any alerting.

**Fix:** Add an Anthropic API liveness check (e.g., `client.messages.create` with `max_tokens: 1`) in the health check, with a cached result (TTL: 60s).

### P2-8: Supabase Admin Client Singleton Not Safe for Edge Runtime
The module-level `_adminClient` singleton in `admin.ts` is problematic in Next.js edge runtime environments where modules are re-initialized per request.

**Fix:** Use a WeakRef or request-scoped client in edge runtime contexts.

---

## Low Priority (P3 — nice to have)

### P3-1: No Distributed Tracing / Correlation IDs
Each event has an `id` but there is no trace ID propagating from an incoming HTTP request through event emission → queue → worker → agent → DB writes. Debugging multi-hop flows requires manual `event_id` lookups.

**Fix:** Add `trace_id` (UUID) to `AutomationEventInput` and propagate it through `automation_queue`, `automation_runs`, and `agent_logs`.

### P3-2: router.ts Is a Monolithic Switch Statement (600+ lines total)
The router will become unmaintainable as event types grow. Each case is ~5-10 lines of `runAgent` calls.

**Fix:** Refactor to a handler registry pattern: `Map<AutomationEventType, EventHandler>` populated from handler files.

### P3-3: No Dead Letter Queue (DLQ) for Permanently Failed Events
Events that fail 3 times are marked `status: "failed"` and sit in `automation_queue` indefinitely. There is no DLQ, no alerting on permanently failed events, and no replay mechanism.

**Fix:** After 3 failures, move to a `automation_dlq` table and emit a `dlq_event_added` alert to admin.

### P3-4: Growth Events Router Returns Data But Doesn't Persist
`routeGrowthAutomationEvent` in `growthEvents.ts` returns a routing metadata object but never writes to any DB table. Growth signals are computed but not stored for historical analysis.

**Fix:** Insert into a `growth_signals` or `territory_intelligence` table.

### P3-5: Missing Vercel Cron Configuration (`vercel.json`)
No `vercel.json` was found in the repository. Without it, the cron routes at `/api/cron/*` are not automatically scheduled by Vercel — they must be triggered externally.

**Fix:** Add `vercel.json` with cron schedule entries for all 5 cron routes.

### P3-6: No Schema Validation on Incoming Event Payloads
`emitEvent` accepts `payload: Record<string, unknown>` with no runtime validation. A malformed payload (e.g., missing `job_id`) reaches the handler, which then returns `{ success: false, error: "Missing job_id" }` after a DB round-trip.

**Fix:** Use Zod schemas (already used in `src/lib/validation.ts`) to validate payload shapes at `emitEvent` time per event type.

---

## Architectural Observations

1. **The handler/router split is the dominant architectural issue.** The codebase has two complete event handling implementations: the router (simple, agent-only) and the handlers (full orchestration). Unifying them — making the router dispatch to handler functions — would immediately activate all the built work.

2. **Agent design is excellent.** Each agent has: a well-scoped system prompt, typed output interfaces, a deterministic fallback, and centralized logging. The `BaseAgent` + `runAgent` pattern is clean and extensible.

3. **Event idempotency is well-designed.** The `dedup_key` pattern prevents duplicate processing across cron overlaps. The dedup window strategy (per 5-min, per 10-min buckets) is pragmatic.

4. **The governance layer (governance.ts) is enterprise-grade.** Hard-coded rules run first (no AI latency), then GABRIEL for nuanced cases. Fail-open default on AI failure is the only concern.

5. **Supabase queue vs Redis/BullMQ trade-off.** The current Supabase-based queue is sufficient for MVP/early production. At high job volumes (>1000 events/hr), Postgres polling becomes the bottleneck. The contracts layer should abstract this so BullMQ can be swapped in transparently.

---

## Recommended Immediate Actions

1. **Wire the router to call handler files** — this immediately activates all built orchestration logic (P0-1). Add one `import` per handler and replace inline `runAgent` calls with handler dispatches for the events that have dedicated handlers.

2. **Unify AutomationEventType** — merge both definitions into `src/lib/contracts/events.ts` and update all imports (P0-2). This eliminates the type split risk.

3. **Add `tip_submitted` to router** — single case statement addition activates a fully-built 4-agent handler (P0-4).

4. **Fix the admin notification user_id in ivy-dispute.ts** — query real admin user IDs before inserting (P1-2). One production dispute will expose this bug.

5. **Add SELECT FOR UPDATE SKIP LOCKED to queue worker** — prevents double-processing under concurrent cron runs (P0-3). Implement as a Supabase RPC function `claim_automation_queue_item(limit int)`.

---

## Status Update — 2026-05-25

| Gap ID | Description | Status |
|--------|-------------|--------|
| P0-2 (dual types) | PARTIALLY resolved — `contracts/events.ts` is canonical; old files not yet updated to re-export |
| P0-4 (tip router) | RESOLVED — Stripe webhook `payment_intent.succeeded` now emits `tip_submitted` correctly; router still lacks `case "tip_submitted"` |
| P1-2 (admin user_id) | OPEN — `ivy-dispute.ts` still uses `user_id: "admin"` |
| P1-6 (notifications) | PARTIALLY resolved — API hardened (GET/PATCH); real-time push not yet implemented |
| Contracts layer | RESOLVED — all 6 contract files created (`events`, `agents`, `queues`, `notifications`, `runtime`, `health`, `index`) |
| Runtime health display | RESOLVED — `getPlatformHealth()` implemented; admin page integration pending (Task 8) |
