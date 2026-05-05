# Deployment Checklist

This checklist prepares Velocity/JIT AI for Supabase and Vercel production deployment.

## Supabase

- Confirm linked project ID is the intended production or staging project.
- Reconcile remote migration history with local migrations.
- Apply base schema and production hardening migrations.
- Apply growth, command center, launch, and franchise-related migrations as needed.
- Run database lint after migrations.
- Confirm all required tables exist.
- Confirm RLS is enabled on customer, provider, job, payment, dispute, notification, audit, and agent log tables.
- Run seed against staging before production.
- Enable Google Auth provider and configure callback URLs.
- Verify Storage buckets and policies if photo uploads are enabled.

## Vercel

- Create or select the production Vercel project.
- Set Node.js runtime version compatible with the app.
- Add all required environment variables.
- Add public site URL and auth callback URL.
- Configure build command: `npm run build`.
- Configure install command based on `package-lock.json`.
- Configure production domain.
- Verify preview deployment before production promotion.

## Environment Variables

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_MAPS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `NEXTAUTH_SECRET`

Only public values should use the `NEXT_PUBLIC_` prefix.

## Stripe

- Use test mode for staging verification.
- Configure production webhook endpoint after Vercel deployment.
- Verify webhook signature handling.
- Test deposits, final payments, refunds, disputes, and payout queue behavior.
- Confirm no local fallback path is active in production.

## Post-Deployment Smoke Test

- Landing page loads.
- Customer signup and Google signup work.
- Provider signup works.
- Admin login works.
- Booking creates a job.
- Dispatch creates provider offer.
- Provider accepts job.
- Quote approval works.
- Payment succeeds or test mode confirms correct status.
- Notifications and agent logs are created.
- Admin launch readiness route loads.

## Rollback Plan

- Keep the previous Vercel deployment available for instant rollback.
- Do not run irreversible production data migrations without a backup.
- Export Supabase schema before major migration application.
- Capture failed migration output exactly before retrying.
