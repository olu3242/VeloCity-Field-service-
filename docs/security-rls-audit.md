# Security and RLS Audit

This audit tracks the security posture required before Velocity/JIT AI can launch with real customers, providers, admins, jobs, payments, and AI automation logs.

## Scope

- Supabase Auth and profile linkage
- Tenant-aware data access
- Customer job visibility
- Provider offer and assignment visibility
- Admin organization-wide visibility
- Payments, disputes, notifications, and agent logs
- Service role key isolation
- API request validation

## Current Findings

- Local RLS and tenant hardening migrations exist in the repository.
- The linked Supabase project migration history is not aligned with local migrations.
- Remote seed previously failed because the remote schema did not contain `public.service_areas`.
- `.env.local` is ignored and should not be committed.
- Public Supabase URL and anon key are expected client-side.
- Supabase service role key must remain server-only.

## Required RLS Checks

- Customer can read and update only their own profile and jobs.
- Customer can create bookings only for their own account.
- Provider can read only approved/offered/assigned jobs.
- Provider cannot access unrelated customer contact or payment data.
- Admin can access operational records needed for dispatch, disputes, payments, and audits.
- Agent logs are readable by admins and writable only by trusted server-side code.
- Payment and payout records are never exposed broadly to clients.
- Tenant ID or organization boundary is present on multi-tenant operational tables.
- Admin override actions write audit/job events.

## API Security Checklist

- Validate incoming request bodies with Zod.
- Never trust client-provided user IDs without session verification.
- Use server-side Supabase clients for privileged operations.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of browser bundles.
- Verify webhook signatures for Stripe before mutating payments.
- Treat AI output as advisory and validate deterministic rules before writing state.

## Remaining Blockers

- Remote RLS policies need to be inspected after migration reconciliation.
- Role-based browser QA needs to confirm customer/provider/admin boundaries.
- Seed data needs to run successfully against the target Supabase project.
- Payment and dispute access policies need live verification with sample records.

## Launch Requirement

Security readiness should not be marked complete until migrations are aligned, RLS is verified on the target Supabase project, and role-based QA proves access boundaries.
