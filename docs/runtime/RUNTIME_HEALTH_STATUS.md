# VeloCity Runtime Health Status
**Date:** 2026-05-25
**Branch:** claude/build-velocity-field-service-JVoOY
**Purpose:** Current health snapshot — what works, what needs credentials, what has code gaps.

---

## Summary

| System | Operational | Needs Credentials | Has Code Gaps |
|--------|-------------|-------------------|---------------|
| Event emission (emitEvent) | ✅ Fully operational | ❌ Supabase | None |
| Automation queue (automation_queue) | ✅ Fully operational | ❌ Supabase | ⚠️ No concurrency lock |
| Queue worker (worker.ts) | ✅ Fully operational | ❌ Supabase | ⚠️ No SELECT FOR UPDATE SKIP LOCKED |
| Router | ⚠️ Partial | — | ⚠️ Handler files not wired |
| All 10 AI agents | ⚠️ Fallback mode | ❌ ANTHROPIC_API_KEY | None — fallbacks work |
| Stripe webhooks | ⚠️ Partial | ❌ STRIPE_WEBHOOK_SECRET | Minor missing cases |
| Stripe payments | ⚠️ Partial | ❌ STRIPE_SECRET_KEY | None in webhook code |
| Notifications API | ✅ Fully operational | ❌ Supabase | None |
| SLA monitoring | ✅ Fully operational | ❌ Supabase | ⚠️ Response not wired |
| Admin UI (all pages) | ✅ Fully operational | ❌ Supabase | None |
| Runtime health check | ✅ Fully operational | ❌ Supabase | None |

---

## Fully Operational Systems

Systems that work correctly with valid credentials and no code changes needed:

### Event Emission Pipeline
**File:** `src/lib/automation/emitEvent.ts`
- Dual overload API (Supabase client or shorthand)
- Idempotency via `dedup_key` prevents duplicate events
- Multi-tenant isolation via `tenant_id`
- Inserts to both `automation_events` and `automation_queue` tables
- Returns `{ eventId, queued, duplicate }` result shape

### Queue Worker
**File:** `src/lib/automation/worker.ts`
- Polls `automation_queue` for pending/failed items
- Creates `automation_runs` record for each attempt
- 3-attempt retry with `retryCount × 60s` exponential backoff
- Routes to `routeAutomationEvent` on each item
- Marks items completed/failed with proper timestamps
- **Note:** Needs `SELECT FOR UPDATE SKIP LOCKED` for concurrent safety (GAP-06)

### Notifications API
**File:** `src/app/api/notifications/route.ts`
- `GET /api/notifications?limit=N` returns `{ data: Notification[] }` with `read` field correctly mapped from `is_read`
- `PATCH /api/notifications` supports `mark_all_read`, `id`, and `ids[]`
- User-scoped (reads only current user's notifications)
- Compatible with `NotificationBell` component expectations
- Limits capped at 100 per request

### Admin Automation Page
**File:** `src/app/admin/automation/page.tsx`
- Polls `/api/automation/status` every 15 seconds
- Shows queue KPI cards (pending, failed, completed 24h, payouts queued)
- Lists all 10 AI agents with roles
- Shows recent events and recent runs
- Manual "Process Queue" button
- Cron schedule documentation
- SLA alert banner when failures exist

### Contracts Layer
**Directory:** `src/lib/contracts/`
- All 6 contract files created with full TypeScript types
- `getPlatformHealth()` queries live DB (automation_queue + automation_runs)
- Barrel export via `index.ts` (health.ts imported directly)
- Zero TypeScript errors

### SLA Monitoring Detection
**File:** `src/lib/automation/sla.ts`
- Detects SLA breaches by job status + elapsed time thresholds
- Detects stuck jobs (active > 4 hours)
- Detects expired provider offers
- Emits correct events with dedup keys
- **Note:** Response actions (redispatch, escalation) not executed — handlers not wired (GAP-01)

### GABRIEL Governance Layer
**File:** `src/lib/automation/governance.ts`
- Hard-coded policy rules run first (no AI latency for clear cases)
- GABRIEL AI for nuanced decisions
- Audit log writes for all decisions
- Fail-open default (needs GAP-10 fix for high-risk transitions)
- Provider screening integrated in admin approval route

---

## Systems Requiring Credentials

### Supabase (Required for ALL features)
**Env vars needed:**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Client-side anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side service role key

**Impact if missing:** Platform is non-functional. All DB reads/writes fail. The placeholder guard in `getAdminClient()` throws before returning a broken client.

**Status:** Supabase client code is correct; only real credentials needed.

### Anthropic API (Required for AI features)
**Env vars needed:**
- `ANTHROPIC_API_KEY` — Anthropic API key with claude-sonnet-4 access

**Impact if missing:** All 10 agents fall back to deterministic fallback logic. Platform remains operational with degraded intelligence quality. Fallbacks return reasonable defaults for all agents.

**Fallback behaviors:**
- ALICE: returns `{ serviceable: true, category: "general", urgency: "medium" }`
- MAX: ranks by trust_score descending (simple DB sort, no AI weighting)
- QUINN: returns `{ fair: true, suggestion: null }` (no pricing analysis)
- NOVA: returns `{ allowed: true }` (all state transitions permitted)
- REX: returns `{ trust_score: 70, rating: 4.0, fraud_detected: false }` (neutral defaults)
- IVY: returns `{ recommended_resolution: "review_manually" }` (escalate all disputes)
- FINN: returns `{ payout_safe: true, risk_level: "low" }` (always approves payouts)
- LENA: returns `{ should_send_campaign: false }` (no campaigns without AI)
- TESS: returns `{ action: "monitor" }` (no growth actions)
- GABRIEL: returns `{ approved: true, risk_level: "low" }` (approves all — see GAP-10)

### Stripe (Required for payment features)
**Env vars needed:**
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Client-side for Stripe.js
- `STRIPE_SECRET_KEY` — Server-side for PaymentIntent creation, transfers
- `STRIPE_WEBHOOK_SECRET` — For webhook signature verification

**Impact if missing:** Payment capture fails; Stripe webhook returns early with `mode: "stripe-not-configured"`; payout transfers cannot execute. All other platform features remain functional.

**Detection:** `hasEnvGroup("stripe")` returns false → early exit with graceful response.

### CRON_SECRET (Recommended for production)
**Env var:** `CRON_SECRET`

**Impact if missing:** Cron routes accept all requests (no authentication). In development this is fine; in production any caller can trigger queue processing.

---

## Systems with Code Gaps

### Router (Critical Gap)
**File:** `src/lib/automation/router.ts`
**Gap:** Handler files are not imported or called. Events are routed through inline `runAgent()` calls only.
**Impact:** All orchestration logic (DB writes, event chaining, notifications, Stripe transfers) does not execute.
**Effort to fix:** ~4-6 hours (see AUTOMATION_IMPLEMENTATION_PLAN.md Wave 2)
**Risk if deployed as-is:** Jobs are created but never dispatched. Payouts are never released. Disputes are logged but not investigated. Providers never receive notifications.

### Tip Routing (Critical Gap)
**File:** `src/lib/automation/router.ts`
**Gap:** No `case "tip_submitted"` in the switch statement.
**Impact:** Tip handler (4-agent flow) never runs. Provider not notified. Trust score not bumped.
**Effort to fix:** ~30 minutes

### IVY Dispute Handler — Admin Notification (Production Bug)
**File:** `src/lib/automation/handlers/ivy-dispute.ts`
**Gap:** Uses `user_id: "admin"` literal — FK violation in production.
**Impact:** First dispute in production will cause a DB error in the notification insert.
**Effort to fix:** ~15 minutes (query admin profiles first)

### Queue Concurrency (Production Risk)
**File:** `src/lib/automation/worker.ts`
**Gap:** No `SELECT FOR UPDATE SKIP LOCKED` — concurrent cron runs can double-process.
**Impact:** Under concurrent load: double-payouts, double-notifications, double-agent calls.
**Effort to fix:** ~2 hours (RPC function + worker update)

### Payout Self-Reference (Minor Loop)
**File:** `src/lib/automation/handlers/payout-release.ts`
**Gap:** Emits `payout_released` from within the `payout_released` handler.
**Impact:** Creates unnecessary queue items on every payout (dedup prevents actual loop).
**Effort to fix:** ~5 minutes (remove one line)

---

## What's Needed for Production

### Must Have (before first real transaction)
1. Real Supabase credentials (all 3 env vars)
2. Real Stripe credentials (all 3 env vars)
3. **GAP-01 fix:** Wire router to handler files
4. **GAP-02 fix:** Add `tip_submitted` case to router
5. **GAP-03 fix:** Fix admin notification FK violation in ivy-dispute.ts
6. **GAP-06 fix:** Add queue concurrency protection

### Strongly Recommended (before scaling)
7. Real Anthropic API key (AI vs fallback quality difference)
8. **GAP-10 fix:** Fail-closed governance for high-risk transitions
9. **GAP-07 fix:** Remove payout self-referential event
10. `vercel.json` with cron schedule (or equivalent scheduler)
11. `CRON_SECRET` enforcement made mandatory

### Nice to Have (before public launch)
12. Supabase Realtime for live notification push
13. Distributed trace IDs for debugging
14. AI cost tracking and budget soft-limits
15. Dead letter queue for permanently failed events
16. Review submission automation trigger (GAP-09)

---

## Health Check API

The platform exposes a health check via `getPlatformHealth()`:
**Source:** `src/lib/contracts/health.ts`

Returns:
```typescript
{
  automation_engine: "healthy" | "degraded" | "down",
  ai_runtime: "healthy",     // always healthy (no Anthropic liveness check yet)
  stripe: "healthy",         // always healthy (no Stripe liveness check yet)
  queue: {
    total: number,
    pending: number,
    processing: number,
    completed: number,
    failed: number,
    oldest_pending_age_ms: number | null
  },
  last_processed_at: string | null,
  timestamp: string
}
```

**Degraded threshold:** `failed > 10` → `automation_engine: "degraded"`
**Down threshold:** Queue query fails → `automation_engine: "down"`

**To use in admin page:** Call `getPlatformHealth()` server-side in the admin automation page data fetch and render the result as a health status card.
