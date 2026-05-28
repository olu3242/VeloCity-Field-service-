# VeloCity Runtime Connectivity Map

This map records the current production wiring surface after the VeloCity OS harmonization pass.

## Canonical Runtime Tables

Core marketplace:
- `profiles`: user role, tenant, identity metadata
- `customer_addresses`: saved customer addresses
- `providers`: onboarding, verification, status, trust, Stripe Connect state
- `service_areas`: ZIP/city coverage boundaries
- `jobs`: customer requests, dispatch state, SLA/status timestamps
- `provider_offers`: dispatch offers and provider accept/reject state
- `quotes`, `quote_line_items`, `change_orders`: provider pricing workflow
- `payments`, `payment_ledger`, `payout_ledger`, `payout_queue`, `refund_records`: escrow/payment/payout records
- `reviews`, `provider_tips`, `disputes`, `dispute_evidence`: post-service trust and resolution
- `job_messages`, `job_photos`, `job_checkins`, `receipts`: live field execution record

Automation and AI runtime:
- `automation_events`, `automation_queue`, `automation_runs`, `automation_rules`
- `agent_logs`, `audit_logs`, `access_audit_logs`, `settings_audit_logs`
- `pricing_decisions`, `sla_configs`
- runtime platform tables from migrations `010` through `012`

Access control:
- `tenants`
- `personas`, `persona_assignments`
- `persona_object_permissions`, `persona_field_permissions`, `persona_action_permissions`
- `module_permissions`, `user_permission_overrides`

## Connected Workflows

Customer booking:
- UI: `src/app/book/page.tsx`
- API: `POST /api/jobs`
- DB: `jobs`
- Automation events: `service_request_created`, `serviceability_passed`, `serviceability_failed`
- AI: `alice.classify`
- Serviceability: `validateServiceArea`

Provider dispatch:
- API: `POST /api/admin/dispatch`, `POST /api/offers/[id]`
- DB: `provider_offers`, `jobs`
- AI/scoring: `getAvailableProviders`, provider ranking/scoring helpers
- Notifications: `createInAppNotification`

Provider execution:
- UI: provider job detail, check-in, photo upload, quote creation, message panel
- API: `/api/jobs/[id]/check-in`, `/api/jobs/[id]/photos`, `/api/jobs/[id]/messages`, `/api/quotes`
- DB: `job_checkins`, `job_photos`, `job_messages`, `quotes`
- Realtime now wired for job messages via `useJobMessagesRealtime`

Payments and escrow:
- UI: `/dashboard/jobs/[id]/pay`
- API: `/api/payments/intent`, `/api/webhooks/stripe`, `/api/tips`
- DB: `payments`, `payment_ledger`, `provider_tips`, `payout_queue`, `payout_ledger`
- Stripe: PaymentIntent creation, webhook capture, receipt generation, payout/release helpers

Admin command center:
- UI: admin dashboards and automation logs
- API: `/api/admin/runtime`, `/api/automation/status`, cron routes
- DB: jobs, providers, payments, disputes, automation queue/events/runs, agent logs

Auth/session:
- Client/server/middleware Supabase clients use shared config validation.
- Google OAuth redirects to `/api/auth/callback`.
- Callback exchanges PKCE code and middleware refreshes cookies.

## Standard Architecture Boundary

Repositories:
- `src/lib/repositories/*`
- Direct Supabase access only.

Services:
- `src/lib/services/*`
- Business rules and access assertions only.

Hooks:
- `src/hooks/*`
- Browser orchestration, realtime subscriptions, cleanup, deduplication.

API:
- `src/lib/api/response.ts`
- Standard response format: `{ success, data?, error? }`
- `src/lib/api/client.ts`
- Frontend fetch wrapper that supports both legacy `{ data }` and standardized responses.

UI:
- Components consume hooks/API helpers.
- Existing direct Supabase calls in server pages remain until migrated route-by-route.

## Realtime Channels

Implemented:
- `notifications:{userId}` on `notifications` inserts
- `job_messages:{jobId}` on `job_messages` inserts
- `job:{jobId}` helper on `jobs` changes

Still pending:
- Provider location tracking channel
- Admin operations aggregate channel
- Dispatch/offer state channel for provider job queue
- Payment/payout ledger change subscriptions

## Known Blockers

- `.env.local` still points to `your-project.supabase.co`; true backend verification cannot pass until real Supabase credentials are supplied.
- Google OAuth must be enabled in Supabase and must include `http://localhost:3003/api/auth/callback`.
- Storage bucket policies for provider documents/customer attachments/job photos need live Supabase verification.
- Stripe keys/webhook secret are required before payment and escrow verification can be completed.
- Several API routes still use legacy `{ data }` responses and should be migrated gradually to `src/lib/api/response.ts`.
