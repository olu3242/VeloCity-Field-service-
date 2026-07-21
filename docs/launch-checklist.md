# VeloCity Field Service — Production Launch Checklist

> Use this checklist immediately before cutting traffic to production.  
> Each item must be marked off by a named team member with a date.

---

## 1. Environment Variables

All 8 required variables must be set in the Vercel production environment (or equivalent). Validate by visiting `/api/health/detailed` after deploy — any missing required var causes startup failure.

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — set to production Supabase project URL (not a staging project)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production anon key from Supabase dashboard → Settings → API
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — production service role key (server-only; never expose in client)
- [ ] `STRIPE_SECRET_KEY` — **live mode** key starting with `sk_live_`
- [ ] `STRIPE_WEBHOOK_SECRET` — webhook signing secret from Stripe dashboard (starts with `whsec_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — **live mode** key starting with `pk_live_`
- [ ] `ANTHROPIC_API_KEY` — production Anthropic API key
- [ ] `CRON_SECRET` — random 32+ character secret; set in both Vercel env and Stripe dashboard is not needed here
- [ ] `NEXT_PUBLIC_APP_URL` — full production URL, e.g. `https://velocity.example.com` (no trailing slash)
- [ ] `TWILIO_ACCOUNT_SID` — production Twilio account SID
- [ ] `TWILIO_AUTH_TOKEN` — production Twilio auth token
- [ ] `TWILIO_PHONE_NUMBER` — verified production sender number in E.164 format, e.g. `+15551234567`
- [ ] `SENDGRID_API_KEY` — production SendGrid API key with Mail Send permission
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — production Maps JavaScript API key (restrict to production domain)
- [ ] `NODE_ENV` — must be `production` in the production deployment

---

## 2. Stripe

- [ ] Switch Stripe account out of test mode — dashboard toggle in top-left
- [ ] Confirm `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are `sk_live_*` / `pk_live_*`
- [ ] Register the production webhook endpoint in Stripe dashboard:  
  - URL: `https://<your-domain>/api/webhooks/stripe`  
  - Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_method.attached`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated`, `payout.created`, `payout.paid`, `payout.failed`
- [ ] Copy the signing secret (`whsec_*`) from the webhook endpoint detail page and set it as `STRIPE_WEBHOOK_SECRET`
- [ ] Verify webhook delivery with Stripe's "Send test event" — confirm `/api/webhooks/stripe` returns 200
- [ ] Enable Stripe Connect for provider payouts — confirm `account.updated` events flow correctly for onboarded providers
- [ ] Set Stripe statement descriptor to "VELOCITY FIELD SVC" or brand equivalent

---

## 3. Supabase

- [ ] Confirm you are connected to the **production** Supabase project (check project URL in dashboard)
- [ ] Apply all 28 migrations — run `supabase db push` or confirm via Supabase dashboard → Database → Migrations that all migration files appear as applied
- [ ] Verify RLS is enabled on all public tables:  
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false;
  ```  
  This query must return zero rows.
- [ ] Verify the default tenant row exists:  
  ```sql
  SELECT id FROM public.tenants WHERE id = '00000000-0000-4000-8000-000000000001';
  ```
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is the production key — do not use the staging service role key
- [ ] Enable Point-in-Time Recovery (PITR) in Supabase dashboard → Settings → Database if on a paid plan
- [ ] Confirm auth email templates are configured (confirmation, password reset, magic link) — Supabase dashboard → Auth → Email Templates
- [ ] Set `Site URL` in Supabase Auth settings to the production domain
- [ ] Add production domain to Supabase Auth → URL Configuration → Redirect URLs

---

## 4. Cron Jobs

- [ ] Vercel Cron Jobs are enabled for the production project (Vercel dashboard → Settings → Cron Jobs)
- [ ] `CRON_SECRET` is set in Vercel production environment variables
- [ ] Verify all 6 cron schedules are visible in Vercel dashboard after deployment:
  - `/api/cron/sla` — every minute
  - `/api/cron/automation` — every 5 minutes
  - `/api/cron/payouts` — hourly
  - `/api/cron/daily-intelligence` — 6 AM daily
  - `/api/cron/daily` — 3 AM daily
  - `/api/cron/predictive` — 7 AM daily
- [ ] Manually invoke `/api/cron/sla` with `Authorization: Bearer <CRON_SECRET>` header and confirm 200 response
- [ ] Manually invoke `/api/cron/automation` and confirm it processes the empty queue without error
- [ ] Confirm cron invocations appear in Vercel Function Logs within 5 minutes of first schedule trigger

---

## 5. Domain and App URL

- [ ] Custom domain is configured in Vercel and DNS is propagated
- [ ] SSL certificate is issued and valid (Vercel auto-provisions via Let's Encrypt)
- [ ] `NEXT_PUBLIC_APP_URL` is set to the production domain with `https://` and no trailing slash
- [ ] Redirect `www.` to apex (or vice versa) — configure in Vercel domain settings
- [ ] Verify that Supabase auth redirects land on the correct domain (test password reset flow end-to-end)

---

## 6. Health Monitoring

- [ ] `GET /api/health` returns `{ status: "ok" }` with 200 in production
- [ ] `GET /api/health/detailed` returns full dependency status (Supabase reachable, Stripe ping, etc.) — verify each dependency shows healthy
- [ ] Configure uptime monitoring (e.g., Better Uptime, Checkly) on `/api/health` with 1-minute interval and alert threshold of 2 consecutive failures
- [ ] Verify Vercel Function Logs are accessible and log output is visible for at least one test request
- [ ] Confirm `[VeloCity Error]` entries surface in logs when an error boundary is triggered (test by causing a deliberate render error in a non-critical route in staging)

---

## 7. Smoke Tests

Run these flows end-to-end in production **before** announcing launch. Use real Stripe test cards only in staging; production smoke tests should use the smallest live amounts possible or a dedicated internal account.

### Customer booking flow
- [ ] Create a new customer account via `/auth/signup`
- [ ] Verify confirmation email arrives and account activates
- [ ] Submit a service request — confirm job is created and ALICE classification runs
- [ ] Confirm automation event is enqueued and processed within 5 minutes

### Provider acceptance flow
- [ ] Log in as an approved provider
- [ ] Confirm job offer appears in provider dashboard
- [ ] Accept the offer — confirm job transitions to `accepted`
- [ ] Submit a quote — confirm QUINN review runs and customer receives notification

### Payment flow
- [ ] Customer approves the quote
- [ ] Provider completes the job
- [ ] Confirm payment intent is created and collectible
- [ ] Confirm payout is queued with correct hold period in `payout_queue`
- [ ] Wait for payout cron (`/api/cron/payouts`) to release — confirm `payout.paid` event is received from Stripe

### Dispute flow
- [ ] Open a dispute on a completed job
- [ ] Confirm IVY dispute handler runs and logs an event to `audit_logs`
- [ ] Resolve the dispute as admin — confirm job and payment records are updated

---

## 8. Notifications

- [ ] Twilio SMS: send a test notification via the admin panel or directly via `/api/notifications/sms` (internal test endpoint) — confirm message arrives on a real phone
- [ ] SendGrid email: send a test transactional email — confirm delivery and check spam score
- [ ] Verify that Twilio and SendGrid failure modes are handled gracefully (feature-degrade, not crash) — check that a Twilio outage does not block job creation
- [ ] Confirm that SendGrid domain authentication (DKIM/SPF) is configured for the sending domain to avoid deliverability issues

---

## 9. Final Pre-Launch Gates

- [ ] Run `npm run build` locally against production env vars and confirm zero TypeScript errors and zero build warnings related to missing vars
- [ ] Run `npm run type-check` — zero errors
- [ ] Confirm no `console.log` statements leak sensitive data (search codebase: `grep -r "console.log" src/app/api` and review output)
- [ ] Confirm all admin routes require role check — spot-check `/admin/command-center` while logged in as a customer (should redirect to `/dashboard`)
- [ ] Confirm Supabase anon key is NOT the service role key (they are different strings)
- [ ] Remove or disable any `/api/debug/*` or `/api/dev/*` endpoints that were added during development
- [ ] Verify `robots.txt` is configured correctly — admin and API routes should be disallowed
- [ ] Tag the release commit in git: `git tag v1.0.0-launch` and push the tag

---

## Sign-off

| Area | Owner | Date | Status |
|---|---|---|---|
| Environment variables | | | |
| Stripe configuration | | | |
| Supabase migrations + RLS | | | |
| Cron jobs | | | |
| Domain + SSL | | | |
| Health monitoring | | | |
| Smoke tests | | | |
| Notifications | | | |
| Final gates | | | |
