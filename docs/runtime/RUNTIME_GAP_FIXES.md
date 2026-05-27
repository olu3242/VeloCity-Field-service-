# VeloCity Runtime Gap Fixes
**Date:** 2026-05-25
**Branch:** claude/build-velocity-field-service-JVoOY
**Source:** RUNTIME_VERIFICATION_REPORT.md flow analysis

---

## Critical Fixes (P0 — Must Fix Before Production)

---

### GAP-01: Router Does Not Call Handler Files
**Gap description:** `router.ts` uses inline `runAgent()` calls for all events. The 13 handler files in `src/lib/automation/handlers/` — which contain all DB writes, event chaining, Stripe API calls, and proper notifications — are never called. Events are "processed" by AI-only calls with no persistence.

**Root cause:** The router was written before handler files were created. The handler architecture was layered on top but never connected. No imports exist in `router.ts` for any handler file.

**Fix required:**
```typescript
// Add to top of src/lib/automation/router.ts:
import { handleAliceIntake } from "./handlers/alice-intake";
import { handleMaxDispatch } from "./handlers/max-dispatch";
import { handleNovaWorkflow } from "./handlers/nova-workflow";
import { handleQuinnQuote } from "./handlers/quinn-quote";
import { handleFinnPayment } from "./handlers/finn-payment";
import { handleIvyDispute } from "./handlers/ivy-dispute";
import { handleRexCompletion } from "./handlers/rex-completion";
import { handleLenaRetention } from "./handlers/lena-retention";
import { handleTessTerritory } from "./handlers/tess-territory";
import { handleSLACheck } from "./handlers/sla-check";
import { handlePayoutRelease } from "./handlers/payout-release";
import { handleTipSubmitted } from "./handlers/tip-submitted";

// Then update each case to call the handler instead of runAgent() inline
```

Replace inline `runAgent(alice, ...)` calls with `handleAliceIntake(payload, queueItem)` for each event group. See `AUTOMATION_IMPLEMENTATION_PLAN.md` Wave 2 for the complete case-by-case mapping.

**Files affected:**
- `src/lib/automation/router.ts` — primary change

**Priority:** P0 — All 12 critical flows are affected by this single gap.

---

### GAP-02: `tip_submitted` Missing from Router Switch
**Gap description:** The router `switch(eventType)` has no `case "tip_submitted"`. Tips fall through to the GABRIEL default case. The 4-agent tip handler (GABRIEL audit + REX trust bump + FINN reconciliation + LENA campaign + provider notification + review nudge) never runs.

**Root cause:** The `tip_submitted` event type was added to the system after the router was written and was not included in the switch.

**Fix required:**
```typescript
// Add to router.ts switch statement:
case "tip_submitted": {
  actions.push("TIP.handler");
  const queueItem = { id: "", event_type: "tip_submitted", payload, status: "processing", retry_count: 0, tenant_id: tenantId, event_id: null };
  const result = await handleTipSubmitted(payload, queueItem as AutomationQueueItem);
  output.tip = result.output;
  break;
}
```

**Files affected:**
- `src/lib/automation/router.ts`

**Priority:** P0 — Tips are a revenue feature; silent failure is unacceptable.

---

### GAP-03: `handlers/ivy-dispute.ts` Uses `user_id: "admin"` (FK Violation)
**Gap description:** Line 77 of `ivy-dispute.ts` inserts a notification with `user_id: "admin"` — a literal string, not a UUID. In production Supabase with `notifications.user_id REFERENCES profiles(id)`, this insert will fail with a foreign key violation. Admin dispute alerts are silently lost.

**Root cause:** Placeholder code not updated to query real admin user IDs.

**Fix required:**
```typescript
// In ivy-dispute.ts, replace:
await db.from("notifications").insert({ user_id: "admin", ... });

// With:
const { data: admins } = await db
  .from("profiles")
  .select("id")
  .eq("role", "admin")
  .limit(10);
for (const admin of admins ?? []) {
  await db.from("notifications").insert({
    user_id: admin.id,
    type: "dispute_opened",
    message: `New dispute opened for job ${job_id}`,
    job_id,
    metadata: { dispute_id, provider_id, customer_id },
  });
}
```

**Files affected:**
- `src/lib/automation/handlers/ivy-dispute.ts`

**Priority:** P0 — Any dispute in production will fail silently on admin notification.

---

### GAP-04: Payout Release Not Executed (Handler Not Wired)
**Gap description:** `handlers/payout-release.ts` contains the actual `stripe.transfers.create()` call that executes provider payouts. This handler is not called from the router. Payout events are "processed" (FINN AI runs) but no actual Stripe transfer is initiated.

**Root cause:** Same as GAP-01 — router not wired to handlers.

**Fix required:** Wire `handlePayoutRelease` into router for `payout_queued`, `payout_released`, `payout_failed` cases (part of GAP-01 fix).

**Files affected:**
- `src/lib/automation/router.ts`
- `src/lib/automation/handlers/payout-release.ts` (also fix the self-referential event — see GAP-07)

**Priority:** P0 — Providers are not paid.

---

### GAP-05: ALICE → MAX Chain Broken (No `serviceability_passed` Emitted)
**Gap description:** When a new job is booked and `service_request_created` is processed, ALICE AI runs but `handlers/alice-intake.ts` is not called. The handler is what emits `serviceability_passed` (which triggers MAX dispatch). Without it, every new booking is stuck with no provider assigned.

**Root cause:** Same as GAP-01.

**Fix required:** Wire `handleAliceIntake` into router for `service_request_created`, `serviceability_passed`, `serviceability_failed`. The handler will emit `serviceability_passed` which then triggers MAX.

**Files affected:**
- `src/lib/automation/router.ts`

**Priority:** P0 — New bookings cannot be dispatched to providers.

---

## High Priority Fixes (P1)

---

### GAP-06: No Concurrency Protection in Queue Worker
**Gap description:** `worker.ts` selects `status IN ("pending", "failed")` and then updates `status = "processing"` as two separate operations. Under concurrent cron invocations, two workers can both read the same row as "pending" and both update it to "processing", resulting in double-processing (double-charges, double-payouts, double-notifications).

**Root cause:** Postgres requires `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent queue consumers. Supabase PostgREST does not support this directly — requires an RPC function.

**Fix required:**
1. Create Supabase migration:
```sql
CREATE OR REPLACE FUNCTION claim_automation_queue_items(
  p_limit int DEFAULT 10,
  p_tenant_id text DEFAULT NULL
)
RETURNS SETOF automation_queue AS $$
  UPDATE automation_queue
  SET status = 'processing', updated_at = NOW()
  WHERE id IN (
    SELECT id FROM automation_queue
    WHERE status IN ('pending', 'failed')
      AND available_at <= NOW()
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
```

2. Update `worker.ts`:
```typescript
const { data: rows } = await client.rpc("claim_automation_queue_items", {
  p_limit: limit,
  p_tenant_id: tenantId ?? null,
});
```

**Files affected:**
- `src/lib/automation/worker.ts`
- New file: `supabase/migrations/009_queue_locking.sql`

**Priority:** P1 — Under normal production load, concurrent crons will cause double-processing.

---

### GAP-07: `payout-release.ts` Emits `payout_released` From Inside `payout_released` Handler
**Gap description:** `handlers/payout-release.ts` emits a `payout_released` event on successful transfer (line ~96). This creates a self-referential loop: the `payout_released` event triggers the handler, which emits another `payout_released` event. The dedup key prevents infinite loops but creates unnecessary queue items and DB writes on every payout.

**Root cause:** Copy-paste error; the handler was written to emit success events but inadvertently emits the same event that triggered it.

**Fix required:** Remove the `await emitEvent("payout_released", ...)` call inside the payout-released case of `payout-release.ts`. The Stripe webhook already emits this event when the transfer succeeds.

**Files affected:**
- `src/lib/automation/handlers/payout-release.ts`

**Priority:** P1 — Wastes queue capacity and creates confusing audit trails.

---

### GAP-08: `provider_suspended` Not in AutomationEventType Registry
**Gap description:** `provider_suspended` is used as a `NotificationType` in `contracts/notifications.ts` but does not exist in the `AutomationEventType` union. Provider suspension has no automated downstream effects.

**Root cause:** The event type was not added when the notification type was created.

**Fix required:**
1. Add `"provider_suspended"` and `"provider_approved"` to `AUTOMATION_EVENT_TYPES` in both `src/lib/contracts/events.ts` and `src/lib/automation/types.ts`.
2. Add cases in router for both events.
3. Add handler logic: on `provider_suspended`, reassign in-progress jobs, freeze payouts, notify provider and affected customers.

**Files affected:**
- `src/lib/contracts/events.ts`
- `src/lib/automation/types.ts`
- `src/lib/automation/router.ts`
- New: `src/lib/automation/handlers/provider-status.ts`

**Priority:** P1 — Suspending a provider should trigger immediate job reassignment.

---

### GAP-09: Review Submission Has No Automation Trigger
**Gap description:** When a customer submits a review, no automation event is emitted. REX trust score is not updated based on the review content or rating. Provider score can only be updated by the daily `provider_scoring` batch, not in real time.

**Root cause:** Review submission was built as a simple DB insert without automation integration.

**Fix required:**
1. Add `"review_submitted"` event type.
2. Emit `review_submitted` from `POST /api/reviews` after successful insert.
3. Add router case → `runAgent(rex, ...)` to update trust score based on rating.

**Files affected:**
- `src/lib/contracts/events.ts` (new event type)
- `src/lib/automation/types.ts` (new event type)
- `src/app/api/reviews/route.ts` (emit event)
- `src/lib/automation/router.ts` (new case)

**Priority:** P1 — Trust scores are a core feature; real-time updates expected.

---

### GAP-10: GABRIEL AI Fails Open for High-Risk Transitions
**Gap description:** When Anthropic API is unavailable, `governance.ts` returns `approved: true` for all state transitions. This means a network blip silently approves high-risk transitions like `in_progress → completed_pending_confirmation` (which triggers payment capture).

**Root cause:** Fail-open was chosen as the default for operational continuity. For low-risk transitions this is acceptable; for financial transitions it is not.

**Fix required:**
```typescript
// In governance.ts, replace AI fallback:
const HIGH_RISK_ACTIONS = ["approve_payout", "mark_completed", "apply_refund", "provider_approval"];
const isHighRisk = HIGH_RISK_ACTIONS.includes(req.action);
return {
  approved: !isHighRisk,  // fail-closed for high-risk; fail-open for low-risk
  reason: "AI unavailable — applying risk-based default",
  risk_level: isHighRisk ? "high" : "low",
  actions: isHighRisk ? ["manual_review_required"] : [],
};
```

**Files affected:**
- `src/lib/automation/governance.ts`

**Priority:** P1 — Financial state transitions must fail-safe.

---

## Medium Priority Fixes (P2)

---

### GAP-11: Dual AutomationEventType Definitions
**Gap description:** `src/types/automation.ts` (28 events) and `src/lib/automation/types.ts` (57 events) define different sets of events. Handler files import from `src/types/automation.ts`; the router uses `src/lib/automation/types.ts`. Canonical source is now `src/lib/contracts/events.ts`.

**Root cause:** Type definitions grew organically in two places.

**Fix required:** Update both legacy files to re-export from contracts:
```typescript
// src/types/automation.ts
export type { AutomationEventType, AutomationEventInput, AutomationRouteResult, AutomationQueueRow }
  from "@/lib/automation/types";
// ... or from contracts
```

**Files affected:**
- `src/types/automation.ts`
- `src/lib/automation/types.ts`

**Priority:** P2 — TypeScript catches most issues; runtime impact is low.

---

### GAP-12: BaseAgent Uses Cookie-Based Client for Logging
**Gap description:** `base.ts` calls `createAdminClient()` from `@/lib/supabase/server` in the `log()` function. This is a cookie-based client that requires an active request context. In cron/automation contexts (no cookies), this may silently fail to log.

**Root cause:** `createAdminClient` was used instead of the service-role `getAdminClient`.

**Fix required:**
```typescript
// In base.ts log() function:
import { getAdminClient } from "@/lib/supabase/admin"; // replace createAdminClient import
const supabase = getAdminClient(); // replace await createAdminClient()
```

**Files affected:**
- `src/lib/agents/base.ts`

**Priority:** P2 — Logging failures are silent; agent runs may not be recorded in cron context.

---

### GAP-13: `provider_offer_sent` Handler Adds No Value
**Gap description:** `handlers/provider-offer.ts` only writes one audit log entry. The meaningful work (offer creation, provider notification) happens in `handlers/max-dispatch.ts`. Calling this handler redundantly wastes a DB insert.

**Root cause:** Handler was created as a skeleton and not enriched.

**Fix required:** Either enrich with push/SMS notification dispatch for offers, or remove the separate handler and consolidate the audit log into `max-dispatch.ts`.

**Files affected:**
- `src/lib/automation/handlers/provider-offer.ts`
- `src/lib/automation/router.ts` (remove dedicated case if handler deleted)

**Priority:** P2 — Cleanup; no functional impact.

---

### GAP-14: `provider_scoring` Handled in `lena-retention.ts` (Semantic Mismatch)
**Gap description:** `handleLenaRetention` contains a branch that handles `provider_scoring` events, running REX-style logic inside a LENA handler. This creates confusion and makes it harder to find provider scoring logic.

**Root cause:** Handler was extended instead of creating a separate REX handler.

**Fix required:** Extract provider scoring logic to a new `handlers/rex-scoring.ts`. Update router to dispatch `provider_scoring` and `provider_scoring_due` to the new handler.

**Files affected:**
- `src/lib/automation/handlers/lena-retention.ts` (remove scoring block)
- New: `src/lib/automation/handlers/rex-scoring.ts`
- `src/lib/automation/router.ts` (update case mapping)

**Priority:** P2 — Code organization; no functional impact.

---

## Low Priority Fixes (P3)

---

### GAP-15: No Distributed Trace IDs
**Gap description:** Events have an `id` but no `trace_id` propagating from HTTP request → emitEvent → queue → worker → agent → DB. Cross-hop debugging requires manual correlation by `event_id`.

**Fix required:** Add optional `trace_id` parameter to `AutomationEventInput`; propagate through queue and runs tables.

**Files affected:** `emitEvent.ts`, `types.ts`, database schema

**Priority:** P3 — Observability improvement.

---

### GAP-16: No vercel.json for Cron Scheduling
**Gap description:** No `vercel.json` exists. Cron routes at `/api/cron/*` are not automatically scheduled on Vercel.

**Fix required:** Create `vercel.json` with cron entries for all 5 routes.

**Files affected:** New `vercel.json`

**Priority:** P3 — Required for production but not a code gap.

---

### GAP-17: Growth Events Computed but Not Persisted
**Gap description:** `routeGrowthAutomationEvent()` in `growthEvents.ts` returns routing metadata but never writes to any DB table. Growth signals are computed by TESS but not stored for historical analysis or admin visibility.

**Fix required:** Insert computed growth signals into a `growth_signals` table or `territory_intelligence` table after TESS runs.

**Files affected:**
- `src/lib/automation/growthEvents.ts`
- New DB migration for `growth_signals` table

**Priority:** P3 — Analytics gap; no immediate impact on platform operation.

---

## Fix Priority Summary

| Priority | Count | Blocking |
|----------|-------|---------|
| P0 | 5 | Production launch |
| P1 | 5 | Core features broken |
| P2 | 4 | Code quality, silent failures |
| P3 | 3 | Observability, nice-to-have |

**Most impactful single fix:** GAP-01 (wire router to handlers) — resolves the root cause of all 10 partial flows and unblocks the entire orchestration layer in one file change.
