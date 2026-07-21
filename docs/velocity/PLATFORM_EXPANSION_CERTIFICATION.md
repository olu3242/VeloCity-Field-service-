# PLATFORM EXPANSION — CERTIFICATION COMPLETE

**Phases**: 5 new portal surfaces
**Status**: CERTIFIED ✓
**Date**: 2026-07-21
**Build**: ✓ PASSED

---

## What Was Built

### Phase 1 — Membership Customer Portal

**`/dashboard/membership`** (server component)
- Full portal: active subscriptions, entitlement usage bars, savings realized, billing frequency and period-end dates
- Entitlement per-service progress bars with red/yellow/green threshold coloring
- Uses `computeCustomerMembershipSummary()` — all data evidence-backed from `membership_usage` + `jobs` tables

**`/admin/memberships`** (server component, admin-only)
- KPI row: total plans, active subscribers, paused, total subscriptions
- Plan cards with monthly/annual pricing and subscriber counts
- Recent subscriptions table (up to 50 rows, newest first)
- Uses `createAdminClient()` scoped to `profile.tenant_id`

### Phase 2 — Notification Inbox

**`/dashboard/notifications`** (client component)
- Full inbox for authenticated customers
- Fetches from `GET /api/notifications?limit=100` (existing API, RLS-scoped)
- Mark individual or all-as-read via `PATCH /api/notifications`
- Unread badge dot, `timeAgo()` labels, job deep-link if `job_id` present
- Zero new API routes needed — existing `/api/notifications` route covers both GET and PATCH

**`/provider/notifications`** (client component)
- Same inbox experience in the dark provider theme
- Job links point to `/provider/jobs/:id`
- Nav includes Dashboard, Jobs, Earnings, Skills, Notifications tabs

### Phase 3 — Provider Skills & Certifications

**`/provider/skills`** (server component, role=provider gate)
- Reads `provider_skills`, `provider_skill_progress`, `provider_certifications` via `createAdminClient()`
- Skill cards: proficiency score (0–100), tier badge (novice/competent/proficient/expert), completed jobs, avg rating
- Per-skill progress bar + tier ladder labels + gap-to-next-tier callout from `provider_skill_progress.gap_summary`
- Active certifications section (bronze/silver/gold/elite) with award dates
- Cancellation rate warning when >5%
- Skills computed automatically by REX on every `job_completed` event — page is read-only

### Phase 4 — Customer Dispute Filing

**`/dashboard/disputes`** (server component + `NewDisputeForm` client component)
- Lists all disputes initiated by the current user (RLS: `initiated_by = auth.uid()`)
- `NewDisputeForm` — client component that POSTs to existing `POST /api/disputes`
  - Only shows eligible jobs (completed/confirmed, not already disputed)
  - 6 canned dispute reasons matching the backend enum
  - Redirects to `/dashboard/disputes/:id` on success
- IVY agent analyzes dispute on submission (already in the API route)

**`/dashboard/disputes/[id]`** (server component)
- Status card with `statusLabel()` human-readable descriptions
- Resolution notes and refund amount when resolved
- Related job details (title, category, amount)
- IVY recommendation display (outcome, reasoning, severity)
- Redirects admin/super_admin to `/admin/disputes/:id`

### Phase 5 — Commercial Accounts Portal

**`/dashboard/commercial`** (server component)
- Looks up `commercial_accounts` where `primary_contact_id = auth.uid()`
- Shows "no commercial account" state with contact-admin CTA if none found
- KPI row: active contracts, locations, total jobs, realized revenue
- Contract cards: type, billing frequency, value, service plans with usage quotas
- Uses `computeCommercialAccountSummary()` — computes from `commercial_contracts`, `commercial_service_plans`, `revenue_records`, `commercial_locations`

**`/admin/commercial`** (server component, admin-only)
- All commercial accounts table with status, contract count, active contracts, total value, realized revenue
- Active contracts detail table (up to 50 rows)
- Revenue aggregated from `revenue_records.commercial_account_id`

---

## Security Model

| Surface | Gate | Data Access |
|---------|------|-------------|
| `/dashboard/membership` | auth + redirect non-customers | `computeCustomerMembershipSummary(user.id)` — admin client, customer-scoped |
| `/dashboard/notifications` | API auth via cookie | RLS on `notifications`: `user_id = auth.uid()` |
| `/dashboard/disputes` | auth + customer role check | RLS on `disputes`: `initiated_by = auth.uid()` |
| `/dashboard/disputes/[id]` | auth + initiated_by check | Auth-scoped query — admin redirects to admin page |
| `/dashboard/commercial` | auth + `primary_contact_id = user.id` lookup | `computeCommercialAccountSummary()` scoped by account_id |
| `/provider/notifications` | API auth via cookie | Same RLS as customer notifications |
| `/provider/skills` | auth + `role = provider` | Admin client, scoped to `provider.id` (looked up via `user_id = user.id`) |
| `/admin/memberships` | auth + `role = admin` | Admin client, scoped to `profile.tenant_id` |
| `/admin/commercial` | auth + `role = admin` | Admin client, scoped to `profile.tenant_id` |

---

## New Routes Summary

| Route | Type | Phase |
|-------|------|-------|
| `/dashboard/membership` | Dynamic server | 1 |
| `/admin/memberships` | Dynamic server | 1 |
| `/dashboard/notifications` | Static (client) | 2 |
| `/provider/notifications` | Static (client) | 2 |
| `/provider/skills` | Dynamic server | 3 |
| `/dashboard/disputes` | Dynamic server | 4 |
| `/dashboard/disputes/[id]` | Dynamic server | 4 |
| `/dashboard/commercial` | Dynamic server | 5 |
| `/admin/commercial` | Dynamic server | 5 |

**9 new routes. Build: ✓ PASSED. No new dependencies.**
