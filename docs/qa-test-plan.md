# QA Test Plan

This plan covers launch-critical QA for Velocity/JIT AI. Use it alongside `/admin/launch-readiness` and update `docs/production-readiness-audit.md` when flows pass or fail.

## Automated Checks

- `npm run type-check`
- `npm run lint`
- `npm run build`
- `npm run db:seed` after Supabase migration reconciliation

## Demo Account Verification

- Customer demo account can sign up, log in, and view only customer pages.
- Provider demo account can sign up, submit application data, and view provider pages after approval.
- Admin demo account can log in and access admin, growth, command center, and launch readiness dashboards.
- Google sign-up works after the provider is enabled in Supabase Auth.

## Customer Flow

- Customer signs up or logs in.
- Customer creates a service request with category, location, urgency, and notes.
- Intake classification uses ALICE when AI is configured.
- Intake classification falls back deterministically when AI is missing.
- Customer lands on a job status page.
- Customer approves or rejects a provider quote.
- Customer completes payment or local fallback payment path.
- Customer confirms completion and submits review.
- Customer can create a dispute.

## Provider Flow

- Provider applies.
- Admin approves provider.
- Provider views job offers.
- Provider accepts or rejects an offer.
- Provider updates valid workflow states only.
- Provider submits quote.
- Provider submits change order when required.
- Provider sees trust score, earnings forecast, and coaching tips.

## Admin Flow

- Admin views live jobs.
- Admin dispatches unassigned jobs manually or using MAX recommendations.
- Admin reviews provider approvals.
- Admin reviews disputes.
- Admin reviews payment and payout queue.
- Admin reviews AI recommendations and agent activity.
- Admin reviews growth, command center, and launch readiness dashboards.

## Payment QA

- Stripe payment intent creation works when Stripe keys are configured.
- Safe local fallback works when Stripe keys are missing.
- Webhook handler verifies Stripe signatures before updates.
- Deposit and final payment status update records.
- Disputes freeze payout.
- Completed jobs queue payout review.

## Notification QA

- In-app notifications are created.
- SendGrid email sends when configured.
- Twilio SMS sends when configured.
- Missing external keys fall back to in-app notification records.

## AI Agent QA

- ALICE intake logs recommendation.
- MAX dispatch logs ranking.
- QUINN quote review logs outcome.
- NOVA workflow monitor logs risk.
- REX provider coaching logs score.
- IVY dispute summary logs result.
- FINN payment review logs risk.
- LENA retention logs opportunity.
- TESS territory insights log recommendation.
- GABRIEL governance checks log audit output.

## Failure Capture

For each failed flow, capture:

- User role
- Route
- Request payload shape
- Error message
- Expected behavior
- Actual behavior
- Required fix
