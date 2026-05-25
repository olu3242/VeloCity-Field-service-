# VeloCity Enterprise Platform — Implementation Plan
**Date:** 2026-05-23
**Branch:** claude/build-velocity-field-service-JVoOY
**Philosophy:** Harmonize, extend, operationalize — never rebuild what works.

---

## Current State Summary

The automation infrastructure is 80% complete and architecturally sound. All 10 AI agents are implemented with fallbacks. The event pipeline (emitEvent → queue → worker) functions end-to-end. All 13 handler files are fully built. The dominant issue is a **wiring gap**: the router calls agents directly instead of dispatching to the handler files, leaving the richer orchestration logic unreachable. Secondary issues are type duplication, missing concurrency protection, and operational blind spots.

**Do not rewrite.** Every file listed below is extended or connected — not replaced.

---

## Wave 1 — Shared Contracts Foundation (Week 1)

### Goal: Single source of truth for all types — eliminate divergence between `src/types/automation.ts` and `src/lib/automation/types.ts`

### Files to Create:
- `src/lib/contracts/events.ts` — canonical VeloEvent and AutomationEventType
- `src/lib/contracts/agents.ts` — AgentName, AgentContext, AgentResult, AgentRunRecord
- `src/lib/contracts/queues.ts` — QueueItem, QueueStatus, WorkerConfig
- `src/lib/contracts/notifications.ts` — NotificationPayload, NotificationType, NotificationChannel
- `src/lib/contracts/health.ts` — PlatformHealth interface + getPlatformHealth()
- `src/lib/contracts/index.ts` — barrel re-export

### Files to Update (imports only — no logic changes):
- `src/lib/automation/types.ts` — add re-export from contracts/events; keep existing types
- `src/types/automation.ts` — add re-export from contracts/events; deprecation comment

### Success Criteria:
- `npx tsc --noEmit` passes with zero errors in `src/lib/contracts/`
- Both legacy type files can be replaced with a one-line re-export without breaking existing code

### Notes:
- Contracts are **type-only** files — zero runtime logic except `health.ts`
- Do not delete the legacy files yet; update them to re-export from contracts
- `AgentName` type: `"ALICE" | "MAX" | "QUINN" | "NOVA" | "REX" | "IVY" | "FINN" | "LENA" | "TESS" | "GABRIEL"`

---

## Wave 2 — Router Wiring (Week 1-2)

### Goal: Activate all 13 handler files by connecting them to the router

### Files to Update:
- `src/lib/automation/router.ts`

### Approach:
Replace the current inline `runAgent` calls with a handler registry. For each event type that has a dedicated handler file, import the handler function and call it. For event types that do NOT have a dedicated handler, keep the existing `runAgent` call as-is.

```typescript
// Handler registry pattern — add to top of router.ts
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
import { handleProviderOffer } from "./handlers/provider-offer";
import { handleTipSubmitted } from "./handlers/tip-submitted";
```

### Specific Router Cases to Update:
| Event Type(s) | Current | Target |
|---------------|---------|--------|
| `service_request_created`, `serviceability_passed`, `serviceability_failed` | `runAgent(alice, ...)` | `handleAliceIntake(payload, queueItem)` |
| `serviceability_passed` (dispatch trigger) | `runAgent(max, ...)` | `handleMaxDispatch(payload, queueItem)` |
| `provider_offer_sent` | `runAgent(max, ...)` | `handleProviderOffer(payload, queueItem)` |
| `job_accepted`, `job_state_changed`, `job_started` | `runAgent(nova, ...)` | `handleNovaWorkflow(payload, queueItem)` |
| `job_completed`, `customer_confirmed` | `runAgent(nova, ...)` + REX + LENA | `handleRexCompletion(payload, queueItem)` |
| `sla_warn`, `sla_breach`, `sla_escalate`, `job_stuck`, `provider_late` | `runAgent(nova, ...)` | `handleSLACheck(payload, queueItem)` |
| `quote_submitted` | `runAgent(quinn, ...)` | `handleQuinnQuote(payload, queueItem)` |
| `payment_captured`, `payment_failed`, `quote_approved` | `runAgent(finn, ...)` | `handleFinnPayment(payload, queueItem)` |
| `payout_queued`, `payout_released`, `payout_failed` | `runAgent(finn, ...)` | `handlePayoutRelease(payload, queueItem)` |
| `dispute_opened`, `dispute_resolved` | `runAgent(ivy, ...)` | `handleIvyDispute(payload, queueItem)` |
| `retention_campaign`, `retention_campaign_due` | `runAgent(lena, ...)` | `handleLenaRetention(payload, queueItem)` |
| `provider_scoring`, `provider_scoring_due` | `runAgent(rex, ...)` | `handleLenaRetention(payload, queueItem)` (short-term); extract to rex-scoring.ts (Wave 3) |
| `daily_territory_analysis`, growth events | `runAgent(tess, ...)` | `handleTessTerritory(payload, queueItem)` |
| `tip_submitted` | GABRIEL default (bug) | `handleTipSubmitted(payload, queueItem)` |

### Remove From Router After Wiring:
- The unconditional GABRIEL `agent_logs` insert at the bottom of `routeAutomationEvent` (creates false attribution)
- The inline `runAgent` calls that are replaced by handler dispatch

### Success Criteria:
- All 13 handler files are imported and called from the router
- `tip_submitted` has an explicit case
- `failed_notification_retry` has a basic handler (log + mark notification as sent)
- Router remains one file (do not split yet — that's Wave 3)

---

## Wave 3 — Event Fabric Hardening (Week 2)

### Goal: Make the event pipeline production-safe

### Files to Update:
- `src/lib/automation/worker.ts` — add concurrency protection
- `src/lib/automation/emitEvent.ts` — add replay support, observability hooks
- Add: `supabase/migrations/009_queue_locking.sql` — atomic queue claim function

### 3a: Queue Concurrency Protection

Create a Postgres RPC function for atomic queue claim:
```sql
-- supabase/migrations/009_queue_locking.sql
CREATE OR REPLACE FUNCTION claim_automation_queue_items(p_limit int DEFAULT 10, p_tenant_id text DEFAULT NULL)
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

Update `worker.ts` to call this RPC instead of the current `.select()`:
```typescript
const { data: rows } = await client.rpc("claim_automation_queue_items", { p_limit: limit, p_tenant_id: tenantId ?? null });
```

### 3b: emitEvent Observability Hooks

Add to `emitEvent.ts`:
- `trace_id` propagation (optional parameter, UUID auto-generated if not provided)
- Structured error logging (not just return value)
- `emitEventWithTrace()` overload for explicit trace propagation

### 3c: Replay Support

Add to `emitEvent.ts`:
```typescript
export async function replayEvent(eventId: string): Promise<EmitResult> {
  // Fetch original event, re-insert into queue with status: "pending"
  // Copy dedup_key with ":replay:{timestamp}" suffix to bypass dedup
}
```

### Success Criteria:
- Concurrent cron runs do not double-process queue items (verify with test)
- Events have `trace_id` for cross-hop debugging
- Failed events can be replayed from admin UI

---

## Wave 4 — AI Runtime Centralization (Week 3)

### Goal: All AI calls through `runAgent` — verify no direct Anthropic calls outside agents/

### Audit: Search for Direct Anthropic Calls

```bash
grep -r "new Anthropic\|anthropic.messages\|client.messages.create" src/ --include="*.ts" | grep -v "src/lib/agents/"
```

Any hits outside `src/lib/agents/` must be migrated to use `runAgent`.

### Files to Update:
- `src/lib/agents/base.ts` — add cost tracking, model version constant, fallback provider hook
- `src/lib/agents/runAgent.ts` — add structured logging for all agent runs, cost aggregation

### 4a: Model Version Constant

```typescript
// In base.ts
export const AGENT_MODEL = "claude-sonnet-4-20250514" as const;
```

Replace the hard-coded string in `client.messages.create` with this constant. When upgrading models, update one line.

### 4b: Cost Tracking

```typescript
// In BaseAgent.log — add to agent_logs insert:
cost_usd: estimateCostUsd(output.tokensUsed ?? 0),
```

Add `estimateCostUsd(tokens: number): number` utility using claude-sonnet-4 pricing.

### 4c: BaseAgent Logging Fix

Replace `createAdminClient()` (cookie-based server client) with `getAdminClient()` (service-role client) in `base.ts` log function. This prevents logging failures in cron/edge contexts.

### 4d: Agent Budget Soft-Limit (Optional, implement if cost data shows risk)

- Track per-agent tokens per hour in `agent_logs`
- If agent exceeds soft limit, skip AI call and use fallback
- Alert admin via notification

### Success Criteria:
- Zero direct `new Anthropic()` calls outside `src/lib/agents/`
- `agent_logs` table includes `cost_usd` column
- `base.ts` uses `getAdminClient()` for logging

---

## Wave 5 — Operational Fixes (Week 3)

### Goal: Fix the P0 and P1 bugs identified in the gap analysis

### 5a: Fix Admin Notification in ivy-dispute.ts

```typescript
// Replace: user_id: "admin"
// With: query for admin users
const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").limit(10);
for (const admin of admins ?? []) {
  await db.from("notifications").insert({ user_id: admin.id, ... });
}
```

### 5b: Fix payout-release.ts Self-Referential Event

Remove the `await emitEvent("payout_released", ...)` call at line 96 of `payout-release.ts` — this event was already the trigger for this handler.

### 5c: Add failed_notification_retry Handler

Add to `router.ts`:
```typescript
case "failed_notification_retry": {
  // Mark notification as sent (or implement actual delivery)
  const notifId = String(payload.notification_id ?? "");
  if (notifId) {
    await supabase.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", notifId).is("sent_at", null);
  }
  break;
}
```

### 5d: Move provider_scoring Logic to Correct Handler

Extract the provider scoring block from `lena-retention.ts` into a new `handlers/rex-scoring.ts`. Update lena-retention.ts to handle only retention events.

### 5e: Add Stripe Missing Webhook Cases

Add to `webhooks/stripe/route.ts`:
- `charge.dispute.updated` — update dispute record, conditionally unfreeze payout
- `charge.dispute.closed` — finalize dispute resolution
- `customer.subscription.deleted` — emit `subscription_due` cancellation variant

### Success Criteria:
- All P0/P1 bugs from gap analysis resolved
- No admin notification with literal "admin" user_id
- No payout event loop

---

## Wave 6 — Observability Dashboard (Week 4)

### Goal: Admin visibility into platform health, AI costs, and queue state

### Files to Create:
- Use `src/lib/contracts/health.ts` (created in Wave 1) as the data source
- Add to existing admin automation status API (`src/app/api/automation/status/route.ts`)

### 6a: Enhance Automation Status API

Add to `/api/automation/status` response:
```typescript
{
  health: PlatformHealth,          // from getPlatformHealth()
  agent_costs_24h: Record<AgentName, number>,  // from agent_logs
  dlq_count: number,               // failed queue items older than 1hr
  cron_last_ran: Record<string, string>,       // last successful cron run per route
}
```

### 6b: Cron Health Tracking

Add a `cron_runs` table (or use `audit_logs`) to track when each cron route successfully ran. The health check surfaces this.

### 6c: Token Cost Aggregation Query

```typescript
const { data: costs } = await db
  .from("agent_logs")
  .select("agent_name, tokens_used")
  .gte("created_at", since);

const agentCosts = costs?.reduce((acc, row) => {
  acc[row.agent_name] = (acc[row.agent_name] ?? 0) + estimateCostUsd(row.tokens_used ?? 0);
  return acc;
}, {} as Record<string, number>);
```

### Success Criteria:
- Admin page shows: queue depth, pending/failed counts, AI costs per agent (24h), last cron run time
- `getPlatformHealth()` returns meaningful values (not hardcoded "healthy")

---

## Wave 7 — GABRIEL Governance Hardening (Week 4-5)

### Goal: Governance layer covers all high-risk state transitions; audit trail is complete

### Files to Update:
- `src/lib/automation/governance.ts` — risk-based fail posture
- `src/app/api/jobs/[id]/transition/route.ts` — ensure all transitions go through governance

### 7a: Risk-Based GABRIEL Fallback

```typescript
const HIGH_RISK_TRANSITIONS: Array<{ from: JobStatus; to: JobStatus }> = [
  { from: "in_progress", to: "completed_pending_confirmation" },
  { from: "completed_pending_confirmation", to: "customer_confirmed" },
  { from: "awaiting_quote_approval", to: "quote_approved" },
];

// In checkGovernance, when AI fails:
const isHighRisk = HIGH_RISK_TRANSITIONS.some(t => t.from === req.fromStatus && t.to === req.toStatus);
result = {
  approved: !isHighRisk,  // fail-closed for high-risk; fail-open for low-risk
  ...
};
```

### 7b: Audit Trail Completeness

Ensure every payout, refund, and state transition writes to `audit_logs`. Current gaps: refund decisions from IVY, FINN reconciliation results.

### 7c: GABRIEL Provider Screening Integration

Connect `admin/providers/[id]/approve` route to `gabriel.screenProvider()` — verify this is already wired (it is via `governance.ts`) and that the result is stored in the provider record.

### Success Criteria:
- High-risk state transitions fail-closed when AI is unavailable
- All financial decisions (payout, refund, dispute resolution) have audit log entries
- GABRIEL provider screening result stored in `providers.ai_screening_result` column

---

## Wave 8 — Production Readiness (Week 5-6)

### Goal: Platform is ready for real traffic with real credentials

### Checklist:

#### Infrastructure
- [ ] Real Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Real Stripe keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`)
- [ ] Real Anthropic API key (`ANTHROPIC_API_KEY`)
- [ ] `CRON_SECRET` set and enforced (remove optional bypass)
- [ ] `vercel.json` cron schedule configured for all 5 cron routes

#### Cron Schedule (recommended):
```json
{
  "crons": [
    { "path": "/api/cron/sla",               "schedule": "* * * * *"   },
    { "path": "/api/cron/automation",         "schedule": "*/5 * * * *" },
    { "path": "/api/cron/payouts",            "schedule": "0 * * * *"   },
    { "path": "/api/cron/daily",              "schedule": "0 3 * * *"   },
    { "path": "/api/cron/daily-intelligence", "schedule": "30 3 * * *"  }
  ]
}
```

#### Database
- [ ] All 8 migrations applied to production Supabase
- [ ] `claim_automation_queue_items` RPC function created (Wave 3)
- [ ] Row Level Security (RLS) policies reviewed for all tables
- [ ] `agent_logs.cost_usd` column added

#### Monitoring
- [ ] Sentry or equivalent error tracking configured
- [ ] Slack/PagerDuty alert for: queue depth > 50 pending, failed > 10, daily AI cost > $X
- [ ] Uptime check on `/api/automation/process` health endpoint

#### Security
- [ ] `CRON_SECRET` enforcement made non-optional (remove `if (expected && ...)` guard)
- [ ] Stripe webhook endpoint allowlisted to Stripe IPs only
- [ ] Service role key rotated before production launch

#### Testing
- [ ] Integration test: emit `service_request_created` → verify ALICE handler runs → job updated → `serviceability_passed` emitted
- [ ] Integration test: dispute opened → payout frozen → IVY analysis stored
- [ ] Load test: 100 concurrent events → verify no duplicate processing

---

## Summary: File Change Index

| File | Wave | Change Type | Description |
|------|------|-------------|-------------|
| `src/lib/contracts/events.ts` | 1 | CREATE | Canonical event types |
| `src/lib/contracts/agents.ts` | 1 | CREATE | Agent contract types |
| `src/lib/contracts/queues.ts` | 1 | CREATE | Queue contract types |
| `src/lib/contracts/notifications.ts` | 1 | CREATE | Notification types |
| `src/lib/contracts/health.ts` | 1 | CREATE | Platform health utility |
| `src/lib/contracts/index.ts` | 1 | CREATE | Barrel export |
| `src/lib/automation/router.ts` | 2 | UPDATE | Wire handler files |
| `src/lib/automation/worker.ts` | 3 | UPDATE | SELECT FOR UPDATE SKIP LOCKED |
| `src/lib/automation/emitEvent.ts` | 3 | UPDATE | trace_id, replay support |
| `supabase/migrations/009_queue_locking.sql` | 3 | CREATE | RPC claim function |
| `src/lib/agents/base.ts` | 4 | UPDATE | getAdminClient fix, cost tracking |
| `src/lib/automation/handlers/ivy-dispute.ts` | 5 | UPDATE | Fix admin user_id |
| `src/lib/automation/handlers/payout-release.ts` | 5 | UPDATE | Remove self-referential emit |
| `src/lib/automation/handlers/rex-scoring.ts` | 5 | CREATE | Extract provider scoring |
| `src/lib/automation/handlers/lena-retention.ts` | 5 | UPDATE | Remove provider_scoring logic |
| `src/app/api/webhooks/stripe/route.ts` | 5 | UPDATE | Add missing event cases |
| `src/app/api/automation/status/route.ts` | 6 | UPDATE | Add health + cost data |
| `src/lib/automation/governance.ts` | 7 | UPDATE | Risk-based fail posture |
| `vercel.json` | 8 | CREATE | Cron schedule |
