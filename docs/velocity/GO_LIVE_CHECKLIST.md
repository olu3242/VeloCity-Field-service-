# Go-Live Checklist (Final Go-Live Certification Batch, Phase 8)

Concrete, evidence-grounded checklist for deploying VeloCity to a live environment. Each item states what exists in the codebase today, what an operator must still configure outside the codebase (accounts, dashboards, secrets), and whether it blocks go-live.

## Infrastructure

| Item | Status in codebase | What an operator must still do | Blocks go-live? |
|---|---|---|---|
| **Supabase** — project, schema, RLS | 24 of 27 migration files in `supabase/migrations/` enable RLS; multi-tenant boundary certified in `TENANT_BOUNDARY_CERTIFICATION.md` | Create production Supabase project, run `supabase db push` (or apply migrations), set `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` | Yes |
| **Vercel** — hosting, cron | `vercel.json` defines 2 crons (`/api/cron/automation` every 5 min, `/api/cron/daily-intelligence` daily 06:00); 3 more cron routes exist (`daily`, `payouts`, `sla`) but are **not** registered in `vercel.json` | Deploy project to Vercel, confirm env vars are set per environment, decide whether `daily`/`payouts`/`sla` cron routes need their own `vercel.json` entries or an external scheduler — they exist and are auth-gated (`authorizeCron`) but nothing currently invokes them | Yes (the 3 unregistered cron routes are a real gap — see Known Limitations addendum below) |
| **Stripe** — payments, payouts, webhooks | `src/lib/stripe/client.ts`, `src/app/api/webhooks/stripe/route.ts` (signature-verified via `constructWebhookEvent`), `src/lib/payments/createPaymentIntent.ts`; gracefully no-ops when `hasEnvGroup("stripe")` is false | Create live Stripe account, set `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET`, register the production webhook endpoint URL in the Stripe dashboard, switch from test to live mode keys | Yes |
| **Storage** — job photos, receipts | `src/lib/storage/uploadJobPhoto.ts` uses Supabase Storage | Create the Supabase Storage bucket(s) referenced by `uploadJobPhoto.ts`, set bucket-level access policy (not just table RLS) | Yes |
| **Cron** — scheduled automation | See Vercel row above; auth via shared `CRON_SECRET` checked in `authorizeCron()` (`src/lib/cron/auth.ts`) | Set `CRON_SECRET` (32+ chars) in production env, confirm it matches whatever calls the cron endpoints (Vercel Cron sends it as configured, an external scheduler must send it as `Authorization: Bearer` or `x-cron-secret` header) | Yes |
| **Email** — SendGrid | `SENDGRID_API_KEY` declared in `src/lib/env.ts`; notification dispatch reads `unsent` `notifications` rows and is processed by `/api/cron/automation`'s `failed_notification_retry` path, not by SendGrid directly inline — confirm actual send-path implementation before assuming SendGrid is wired end-to-end | Create SendGrid account, verify sender domain, set `SENDGRID_API_KEY` | Yes, if email notifications are required at launch — recommend a smoke test (see Phase 11) to confirm a real email is delivered, not just an API call accepted |
| **Monitoring** | No Sentry/Datadog/external APM integration exists in `src/lib/**` despite agent-internal references to "monitoring" as a concept (e.g. `opsHealthScore.ts`) — those are internal Command Center health scores, not external monitoring/alerting | Decide on and wire an external monitoring/alerting tool (Sentry for errors, a pager for cron/automation failure spikes) — `RISK_REGISTER.md` risk #3 already flags "no automated alerting on automation failure spikes" as unresolved | No (not currently blocking — admins can monitor via Command Center — but strongly recommended before scaling traffic; see Risk Register #3) |

## Operations

| Item | Status in codebase | What an operator must still do | Blocks go-live? |
|---|---|---|---|
| **Backups** | No backup automation exists in this codebase — backups are entirely a Supabase platform feature (point-in-time recovery on paid tiers) | Confirm the production Supabase plan includes PITR/backups, set a retention policy, document the restore procedure | Yes — must be confirmed before go-live, but is a Supabase dashboard setting, not code |
| **Rollback** | Standard Vercel deployment rollback (redeploy a prior build) applies; no custom rollback tooling exists | Confirm Vercel project has rollback enabled (default) and document the rollback procedure (redeploy previous deployment, no DB migration rollback tooling exists so backward-incompatible migrations need care) | Yes |
| **Incident response** | `/api/admin/runtime`'s `pause_runtime` action (now wired into the real automation pipeline per `COMMAND_CENTER_COMPLETENESS.md` — `isRuntimePaused()` is checked in `worker.ts` before any queue row is processed) is the only real incident lever today; it has no UI button, only API access and read-only Command Center visibility | Document the `pause_runtime` curl/script invocation as the documented incident-response action of last resort; decide whether an admin UI for this is needed before or shortly after go-live (currently out of scope per this batch's "no new dashboards" constraint) | No (a documented manual procedure is sufficient to ship; recommended early post-launch follow-up) |
| **Alerting** | None — see Monitoring row above and `RISK_REGISTER.md` risk #3 | Same as Monitoring | No (not blocking, but high-priority follow-up) |

## Security

| Item | Status in codebase | What an operator must still do | Blocks go-live? |
|---|---|---|---|
| **Secrets** | `src/lib/env.ts` enumerates all required env vars by area and provides `isConfiguredValue()`/`hasEnvGroup()` placeholder-detection so the app degrades gracefully (e.g. Stripe webhook no-ops) rather than crashing on missing config | Populate all production secrets in Vercel's environment variable store (not `.env` files committed to the repo — confirmed `.env.example`/`.env.local.example.complete` contain only placeholders, no real secrets) | Yes |
| **RLS** | 24/27 migration files enable RLS; known exceptions are documented, not accidental: `agent_logs` has no RLS (app-level admin-only access only — `RISK_REGISTER.md` risk #1), `membership_entitlements`/`provider_certification_requirements` use `using (true)` intentionally as public catalog data (risk #6) | Accept these two documented exceptions as-is for go-live (both rated Low severity in `RISK_REGISTER.md`), or remediate before launch if risk tolerance is lower | No (both are explicitly assessed as low-risk and documented, not silent gaps) |
| **Admin access** | `assertAdmin()` (duplicated in `src/app/api/admin/runtime/route.ts` and `src/app/api/runtime/trace/[id]/route.ts`) checks `profiles.role === "admin"` AND a non-null `tenant_id` via the authenticated Supabase client (RLS-respecting, not the admin client) before allowing any operator action or runtime-trace read | Confirm at least one production user has `role = "admin"` set in `profiles` before go-live, or no one will be able to use `/api/admin/runtime` at all | Yes |

## Acceptance gate cross-reference

This checklist surfaces one new finding not previously documented: **3 of 5 cron routes (`daily`, `payouts`, `sla`) exist, are auth-gated, and are fully functional, but are not registered in `vercel.json` and therefore will never run on a Vercel deployment unless wired up.** This is recorded as a go-live blocker in this document and carried into `VELOCITY_GO_LIVE_DECISION.md` (Phase 10) rather than silently assumed to be scheduled.

## Status

**CHECKLIST COMPLETE ✅** — every infrastructure, operations, and security item is graded against actual code (not assumed), with explicit blocks-go-live calls. One new gap (unregistered cron routes) was found in the course of this audit and is carried forward, not silently dropped.
