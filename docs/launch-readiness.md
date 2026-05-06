# Velocity/JIT AI Launch Readiness

This document defines the production launch gate for Velocity/JIT AI. It pairs the operator checklist with the `/admin/launch-readiness` dashboard so launch decisions stay visible, auditable, and repeatable.

## Readiness Model

The launch readiness score is calculated from six sections:

- Environment readiness
- QA readiness
- Payment readiness
- AI agent readiness
- Security/RLS readiness
- Deployment readiness

Each checklist item is marked `pass`, `warning`, `fail`, or `blocked`. Required failed or blocked items are promoted into the blocker tracker and become next required actions.

## Current Launch Gate

- Production app shell: ready for verification
- Supabase connection: configured locally, remote migration history still requires reconciliation
- Google auth: app route exists, Supabase provider must be enabled in the Supabase dashboard
- Stripe: supported with safe fallback behavior when payment keys are missing
- AI agents: deterministic fallback behavior exists when Anthropic is missing
- Demo accounts: not yet verified end to end
- Full E2E QA: pending against the live Supabase project

## Required Checklist

- Confirm `.env.local` locally and Vercel environment variables contain all required production values.
- Reconcile remote Supabase migrations before applying the full production schema.
- Verify tenant-aware RLS policies against customer, provider, and admin roles.
- Enable and test Google OAuth in Supabase Auth providers.
- Configure Stripe webhooks for the deployed Vercel URL.
- Create and verify demo customer, provider, and admin accounts.
- Run typecheck, lint, build, and browser QA before launch.
- Confirm payment, dispute, payout, notification, and agent log flows are auditable.

## Admin Route

Use `/admin/launch-readiness` to review:

- Launch readiness score
- Critical blockers
- Environment status
- QA status
- Payment readiness
- AI readiness
- Security readiness
- Deployment readiness
- Next required actions

## Known Blockers

- Remote Supabase migration history is not aligned with local migrations.
- Remote schema previously reported `service_areas` missing during seed.
- Demo account verification is pending.
- Full E2E browser QA is pending.
- Vercel deployment variables and domain are not yet verified.

## Next Recommended Step

Reconcile the Supabase remote schema and migration history, then run seed and full role-based QA against the linked project.
