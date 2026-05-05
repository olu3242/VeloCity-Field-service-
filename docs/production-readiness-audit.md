# Production Readiness Audit

## Current State

- Next.js 14 App Router app with customer, provider, and admin surfaces.
- Supabase schema includes profiles, providers, jobs, quotes, payments, disputes, provider offers, notifications, service areas, and agent logs.
- Tenant demarcation is defined by `tenant_id` across core business tables through `003_tenant_demarcation.sql`.
- Default local tenant: `00000000-0000-4000-8000-000000000001` / `velocity-default`.
- Stripe, Anthropic, Twilio, SendGrid, Google Maps, and Supabase are represented in code but require real environment variables before production use.
- AI agents now fall back deterministically when `ANTHROPIC_API_KEY` is missing.
- Stripe payment intent creation now has a local-dev fallback when Stripe variables are missing.

## MVP Blockers Before Launch

- Configure real `.env.local` values and production secrets.
- Apply Supabase migrations to a linked project and verify RLS with real users.
- Verify tenant RLS policies in Supabase after migration, especially admin visibility and provider offer boundaries.
- Configure Supabase Auth providers and redirect URLs.
- Configure Stripe webhooks and Connect onboarding.
- Replace `notifications@velocity-field-service.com` with a verified SendGrid sender.
- Run full QA checklist against seeded users and real Supabase.

## Latest Supabase Status

- `.env.local` now provides Supabase URL, anon key, and service role key.
- Google OAuth env variables are present locally: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `NEXTAUTH_SECRET`.
- App-side Google OAuth buttons are wired on login/signup and redirect to `/auth/callback`.
- Local Supabase config includes `[auth.external.google]`, but hosted Supabase Google provider still must be enabled in the linked project Dashboard or via an explicit `supabase config push`.
- Workspace is linked to Supabase project ref `vzshucsacgrpuuzjondq`.
- Supabase CLI migration history is not aligned with this repo:
  - Local pending migrations: `001`, `002`, `003`
  - Remote-only migrations: `20260424000000` through `20260424100000`
- `supabase migration up --linked` failed because remote migration versions are missing locally.
- `npm run db:seed` failed with:
  - `PGRST205`
  - `Could not find the table 'public.service_areas' in the schema cache`
  - Supabase hint: `Perhaps you meant the table 'public.services'`

This indicates the currently linked Supabase project is not running the VeloCity schema expected by this app.

## QA Checklist

- Customer signup creates a profile.
- Provider signup and application creates provider record.
- Admin approves provider and provider can go online.
- Customer booking creates a submitted job.
- ALICE logs intake classification or deterministic fallback.
- Admin dispatch creates provider offers.
- Provider receives offer and can accept/reject.
- Provider status transitions only show valid next actions.
- Provider submits quote.
- QUINN logs quote review or deterministic fallback.
- Customer approves/rejects quote.
- Deposit/final payment intent is created.
- Stripe webhook updates payment and job status.
- Provider marks en route, arrived, diagnosis, in progress, and complete.
- Customer confirms completion.
- Review can be submitted once per completed job.
- Dispute opens and freezes payout operationally.
- Refund path updates dispute/payment/job status.
- Payout queue excludes disputed jobs and releases completed jobs.
- Notifications are created in-app and sent externally when keys exist.
- Admin dashboard shows live jobs, unassigned jobs, approvals, disputes, payment queue, and agent logs.
