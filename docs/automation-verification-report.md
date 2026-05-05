# Automation Verification Report

This report verifies whether Velocity/JIT AI automations are implemented, wired, callable, logged, and testable.

Status definitions:

- `VERIFIED`: event is emitted, queued, processed, logged, and visible in admin.
- `PARTIAL`: event exists or is emitted, but is not proven processed, logged, or visible end to end.
- `NOT IMPLEMENTED`: event is only documented or listed, but is not wired in code.

## Summary

| Automation Area | Status | Files Found | Events Verified | Gaps | Fix Applied |
| --- | --- | --- | --- | --- | --- |
| Automation core tables | PARTIALLY IMPLEMENTED | `supabase/migrations/005_automation_core.sql` | `automation_events`, `automation_queue`, `automation_runs`, `automation_rules` defined with indexes, RLS, `retry_count`, `dedup_key`, `status`, `error_message`, `processed_at` | Migration is local and still must be applied to the linked Supabase project | Added automation core migration |
| Automation files | PARTIAL | `src/lib/automation/emitEvent.ts`, `router.ts`, `worker.ts`, `growthEvents.ts` | Queue-backed emit, route, and worker APIs exist | Not live-proven emitted + queued + processed + logged + admin-visible | Added missing core files |
| Queue processor | PARTIAL | `src/app/api/admin/automation/process/route.ts`, `src/lib/automation/worker.ts` | `POST /api/admin/automation/process` is callable in code | Needs live admin QA after migration to prove processing and logs | Added admin-only processor route |
| Cron automation route | PARTIAL | `src/app/api/cron/automation/route.ts`, `src/lib/cron/auth.ts` | Protected route emits due operational events and runs `processAutomationQueue()` | Requires `CRON_SECRET`, deployed cron execution, migration, and E2E proof | Added 5-minute operational cron route |
| Daily intelligence cron | PARTIAL | `src/app/api/cron/daily-intelligence/route.ts`, `src/lib/cron/auth.ts` | Protected route emits daily territory, provider scoring, retention, and franchise events | Requires `CRON_SECRET`, deployed cron execution, migration, and E2E proof | Added daily intelligence cron route |
| Vercel cron config | PARTIAL | `vercel.json` | `/api/cron/automation` every 5 minutes and `/api/cron/daily-intelligence` daily | Needs Vercel deployment verification | Added cron schedule config |
| Booking creation | PARTIAL | `src/app/api/jobs/route.ts` | `service_request_created`, `serviceability_passed`, `serviceability_failed` are emitted in code | Requires DB migration and E2E proof of queue/process/log/admin visibility | Wired `emitEvent` after job creation |
| Dispatch/provider offers | PARTIAL | `src/app/api/admin/dispatch/route.ts` | `provider_offer_sent`, `job_state_changed` are emitted in code | Provider offer expiry is not scheduled; live processing/admin visibility not proven | Wired event emissions |
| Provider accept/reject | PARTIAL | `src/app/api/offers/[id]/route.ts` | `job_accepted`, `job_state_changed`, `job_reassigned` are emitted in code | Rejection uses `job_reassigned`; live processing/admin visibility not proven | Wired event emissions |
| Job status transitions | PARTIAL | `src/app/api/jobs/[id]/transition/route.ts` | `job_state_changed`, `job_started`, `job_completed`, `customer_confirmed`, `review_requested`, `payout_queued` are emitted in code | Payout execution still depends on payment/payout processor wiring; live processing/admin visibility not proven | Wired transition-derived events |
| Quote flow | PARTIAL | `src/app/api/quotes/route.ts`, `src/app/api/quotes/[id]/route.ts` | `quote_submitted`, `change_order_submitted`, `quote_approved`, `quote_rejected` are emitted in code | Live processing/admin visibility not proven | Wired event emissions |
| Payment flow | PARTIAL | `src/app/api/payments/intent/route.ts`, `src/app/api/webhooks/stripe/route.ts` | `payment_authorized`, `payment_failed`, `job_completed`, `payout_queued` are emitted in code | Stripe live webhook endpoint and live processing/admin visibility not proven | Wired payment and webhook events |
| Dispute flow | PARTIAL | `src/app/api/disputes/route.ts` | `dispute_opened` is emitted in code | Request body still needs dedicated Zod schema; live processing/admin visibility not proven | Wired event emission |
| Review flow | PARTIALLY IMPLEMENTED | `src/app/api/reviews/route.ts` | `review_requested` emitted after review creation | This is more accurately a review completed event, but requested event list only includes `review_requested` | Wired event emission for observability |
| Growth events | PARTIALLY IMPLEMENTED | `src/lib/automation/growthEvents.ts`, `src/lib/automation/router.ts`, `src/app/admin/growth/page.tsx` | All requested growth event names are routable | Growth dashboard uses routed recommendations; live emit triggers are not yet scheduled | Router now handles growth events |
| Router coverage | PARTIAL | `src/lib/automation/router.ts` | All requested event names handled in code | Not live-proven through queue processing and admin visibility | Added switch coverage |
| Agent wiring | PARTIALLY IMPLEMENTED | `src/lib/agents/*`, `src/lib/automation/router.ts` | ALICE, MAX, QUINN, NOVA, REX, IVY, FINN, LENA, TESS, GABRIEL are callable directly or through router | ALICE/MAX direct no-key fallbacks still need a dedicated live log proof; full event-to-admin visibility is not live-proven | QUINN deterministic quote fallback now writes `agent_logs`; router uses `runAgent()` and governance logging |
| Scheduled automation | PARTIAL | `src/app/api/cron/automation/route.ts`, `src/app/api/cron/daily-intelligence/route.ts`, `vercel.json` | Cron routes are implemented and scheduled in code | Requires `CRON_SECRET`, Vercel deployment wiring, migrations, and live proof | Added protected cron routes and Vercel cron config |
| Admin observability | PARTIAL | `/admin/command-center`, `/admin/automation/logs`, `/admin/growth`, `/admin/launch-readiness` | Command Center and automation logs page show queue counts, failed events, retry count, event feed, and recent agent logs | Visibility exists in code but is not live-proven after migration and queue processing | Added `/admin/automation/logs` |

## Router Event Coverage

The automation router handles:

- `service_request_created`
- `serviceability_passed`
- `serviceability_failed`
- `provider_offer_sent`
- `provider_offer_expired`
- `job_accepted`
- `job_reassigned`
- `job_state_changed`
- `quote_submitted`
- `quote_approved`
- `quote_rejected`
- `change_order_submitted`
- `payment_authorized`
- `payment_failed`
- `failed_payment_retry`
- `failed_notification_retry`
- `job_started`
- `job_completed`
- `customer_confirmed`
- `review_requested`
- `dispute_opened`
- `payout_queued`
- `payout_failed`
- `sla_breach_detected`
- `stuck_job_detected`
- `subscription_due`
- `warranty_callback_due`
- `daily_territory_analysis`
- `provider_scoring_due`
- `retention_campaign_due`
- `high_demand_area_detected`
- `provider_shortage_detected`
- `surge_pricing_recommended`
- `recurring_service_opportunity_detected`
- `provider_subscription_opportunity_detected`
- `customer_churn_risk_detected`
- `territory_ready_for_expansion`
- `franchise_candidate_area_detected`

## Agent Verification

| Agent | Status | Called From | Fallback | Logging |
| --- | --- | --- | --- | --- |
| ALICE | PARTIALLY IMPLEMENTED | Booking route and automation router | Deterministic classification exists | Direct fallback bypasses `BaseAgent.run`, so no-key direct booking fallback may not log |
| MAX | PARTIALLY IMPLEMENTED | Dispatch route and automation router | Deterministic provider ranking exists | Direct fallback bypasses `BaseAgent.run`, so no-key direct dispatch fallback may not log |
| QUINN | PARTIALLY IMPLEMENTED | Quote route and automation router | Base fallback exists | Router logs deterministic audit for quote events |
| NOVA | PARTIALLY IMPLEMENTED | Job transition route and automation router | Base fallback exists | Logs through `BaseAgent.run`, but full event-to-admin visibility is not live-proven |
| REX | PARTIALLY IMPLEMENTED | Review route and automation router | Base fallback exists | Logs through `BaseAgent.run` when invoked, but full event-to-admin visibility is not live-proven |
| IVY | PARTIALLY IMPLEMENTED | Dispute route and automation router | Base fallback exists | Logs through `BaseAgent.run`, but full event-to-admin visibility is not live-proven |
| FINN | PARTIALLY IMPLEMENTED | Automation router | Base fallback exists | Logs through `BaseAgent.run`, but full event-to-admin visibility is not live-proven |
| LENA | PARTIALLY IMPLEMENTED | Automation router | Base fallback exists | Logs through `BaseAgent.run`, but full event-to-admin visibility is not live-proven |
| TESS | PARTIALLY IMPLEMENTED | Automation router | Base fallback exists | Logs through `BaseAgent.run`, but full event-to-admin visibility is not live-proven |
| GABRIEL | PARTIALLY IMPLEMENTED | Provider/admin routes and automation router governance audit | Base fallback exists | Router writes governance `agent_logs` for processed events, but full event-to-admin visibility is not live-proven |

## Scheduled Automation Gaps

These checks are wired in code through cron routes but are not live-verified until deployed with `CRON_SECRET`, migrations, and manual E2E proof:

- SLA breach detection
- Expired provider offers
- Stuck jobs
- Failed payment retry
- Failed notification retry
- Payout processing
- Territory analysis
- Retention campaigns
- Provider scoring

Cron wiring added:

- `GET/POST /api/cron/automation`, protected by `CRON_SECRET`, scheduled every 5 minutes in `vercel.json`.
- `GET/POST /api/cron/daily-intelligence`, protected by `CRON_SECRET`, scheduled daily in `vercel.json`.

Remaining deployment gap: confirm Vercel sends `Authorization: Bearer $CRON_SECRET`, confirm `CRON_SECRET` is set in Vercel, apply migrations, and run live E2E.

## Manual E2E Test Flow

This flow is now testable after applying the reviewed additive migrations to Supabase:

- `supabase/migrations/006_velocity_additive_bridge.sql`
- `supabase/migrations/007_pricing_payments_automation.sql`

1. Create booking.
2. Confirm `automation_events` contains `service_request_created`.
3. Confirm `automation_queue` contains pending queue item.
4. Call `POST /api/admin/automation/process`.
5. Confirm `automation_runs` completed and `agent_logs` contains ALICE/GABRIEL activity.
6. Dispatch job.
7. Confirm `provider_offer_sent` and MAX-related routing.
8. Accept job.
9. Confirm `job_accepted` and `job_state_changed`.
10. Submit quote.
11. Confirm `quote_submitted` and QUINN routing.
12. Approve quote.
13. Confirm `quote_approved` and payment automation after payment creation.
14. Complete job.
15. Confirm `job_completed`, REX, and LENA routing.
16. Open dispute.
17. Confirm `dispute_opened` and IVY routing.
18. Emit a growth event manually into `automation_events`/`automation_queue`.
19. Process queue and confirm TESS/GABRIEL activity.

## Verification Result

Automation is now code-wired and locally buildable, but live verification remains blocked until the automation migration is applied to the linked Supabase project and manual role-based E2E QA is run.

No automation should be marked `VERIFIED` until the exact event has been proven emitted, queued, processed, logged, and visible in admin against the live Supabase project.

## Live Verification Attempt - 2026-05-05

Requested flow:

1. Create booking.
2. Confirm event in `automation_events`.
3. Confirm queue item in `automation_queue`.
4. Call `POST /api/admin/automation/process`.
5. Confirm queue processed.
6. Confirm `agent_logs` created.
7. Confirm Command Center shows automation activity.

Result: blocked before booking creation.

The configured Supabase project does not expose the app tables through PostgREST. One-row queries returned `PGRST205` for:

- `public.profiles`
- `public.jobs`
- `public.automation_events`
- `public.automation_queue`
- `public.agent_logs`

Earlier migration push also failed because the remote migration history contains versions that do not exist locally, and seed failed because the remote schema did not contain the expected `public.service_areas` table.

Current status remains `PARTIAL`, not `VERIFIED`.

Next required action: apply only the reviewed additive bridge/payment migrations manually in Supabase SQL Editor or with `psql`, then rerun the live E2E automation proof. Do not run full `supabase db push` against the divergent migration stack.

## Multi-Tenant Verification Update

The linked Supabase project is multi-tenant and uses `public.tenants` as the tenant table. Existing remote RLS is based on `public.current_user_tenant_id()`, which reads `tenant_id` from JWT claims.

Velocity/JIT AI verification must therefore be tenant-specific:

1. Identify or create the demo tenant in `public.tenants`.
2. Ensure the demo admin/customer/provider profiles carry the same `tenant_id`.
3. Create the booking with that `tenant_id`.
4. Confirm `automation_events.tenant_id` matches the booking tenant.
5. Confirm `automation_queue.tenant_id` matches the booking tenant.
6. Process queue for that tenant through `POST /api/admin/automation/process`.
7. Confirm `automation_runs.tenant_id` matches the queue tenant.
8. Confirm `agent_logs.tenant_id` matches the queue tenant.
9. Confirm Command Center filters and displays automation activity for only that tenant.

Supporting schema notes are documented in `docs/multi-tenant-schema-mapping.md`.

## P1 Operator Routes Added

The following routes now exist in code and are ready for tenant-scoped QA after the additive schema is applied:

- `/admin/jobs/[id]`
- `/admin/providers/[id]`
- `/admin/disputes`
- `/dashboard/jobs/[id]/review`
- `/admin/payouts`
- `/provider/earnings`
- `/admin/automation/logs`

These routes must remain `PARTIAL` for live verification purposes until Supabase contains the required app-owned tables and the demo tenant proof chain is completed.
