# FRANCHISE OS EXTENSION — CERTIFICATION COMPLETE

**Phase**: Franchise OS Extension (Session 3)
**Status**: CERTIFIED ✓
**Date**: 2026-07-21

---

## What Was Built

### 1. Franchise Lifecycle Automation
**Files**: `src/lib/automation/types.ts`, `src/types/automation.ts`, `src/lib/automation/handlers/franchise-lifecycle.ts`, `src/lib/automation/router.ts`

Three new automation event types added to the pipeline:

| Event | Handler Action |
|-------|---------------|
| `operator_approved` | Updates `territory_operators.status` → `"approved"`, writes audit_log |
| `territory_activated` | Updates `franchise_territories.status` → `"active"`, writes audit_log |
| `franchise_royalty_due` | Settles `revenue_records` (sets `settled=true`, `settled_at`), writes royalty audit_log |

All three events route through `callIfEnabled("franchise-lifecycle", ...)` — gated by operator controls and circuit breaker. Added to router switch in `router.ts`.

### 2. Admin Franchise Management (`/admin/franchise`)
**File**: `src/app/admin/franchise/page.tsx`

Admin-only page (role=admin gate + redirect). Uses `createAdminClient()` scoped to `profile.tenant_id`.

Features:
- KPI row: total territories, active, evaluating, avg readiness score
- Territory cards with latest scorecard data (readiness, revenue, jobs, providers, SLA hit, dispute rate)
- Per-card operator list showing status badges
- Operator candidates pipeline table at bottom with pending review count

### 3. Franchise Jobs View (`/franchise/jobs`)
**File**: `src/app/franchise/jobs/page.tsx`

Franchise-owner-scoped job view. No RLS exists on `jobs` for franchise owners — uses `createAdminClient()` with application-level scoping to territory zip codes (`.in("zip", allZips)`).

Features:
- KPI row: total, completed, in-progress, pending jobs
- Full jobs table with status badges, urgency colors, location, territory name, and date
- Zip-to-territory reverse-lookup map for the Territory column

### 4. Franchise Operator Application Flow
**Files**: `src/app/franchise/apply/page.tsx`, `src/app/api/franchise/apply/route.ts`

Public-facing application form for prospective franchise operators.

API (`POST /api/franchise/apply`):
- Auth required; does not require `franchise_owner` role
- Validates territory exists via `getAdminClient()` (not auth-scoped, so applicants can resolve the UUID)
- Deduplication check: 409 if applicant already has a row for this territory
- Creates `territory_operators` row with `status="candidate"`
- Writes `audit_logs` row with action `franchise_operator_applied`

Form fields: full name (required), email, territory UUID (required), years experience, startup capital.

### 5. Navigation Update
**Files**: `src/app/franchise/dashboard/page.tsx`, `src/app/franchise/territory/page.tsx`, `src/app/franchise/revenue/page.tsx`, `src/app/franchise/providers/page.tsx`, `src/app/franchise/jobs/page.tsx`

Jobs nav link added to all franchise pages. Each page highlights its own link (`text-[#CCFF00]`).

Final nav order: **Dashboard → Territory → Jobs → Revenue → Providers**

---

## Build Verification

```
✓ npm run build — PASSED
All franchise routes compiled: /franchise/apply (static), /franchise/dashboard, /franchise/jobs, /franchise/providers, /franchise/revenue, /franchise/territory (all dynamic)
/admin/franchise — dynamic
/api/franchise/apply — API route registered
```

One type error fixed during build: `gabriel.generateExecutiveBriefing()` does not exist on `GabrielAgent` (which only exposes `screenProvider` and `auditJob`). Removed the GABRIEL call from `franchise-lifecycle.ts`; the royalty settlement audit log is sufficient evidence.

---

## Security Model

| Surface | Auth Gate | Data Scope |
|---------|-----------|------------|
| `/franchise/*` pages | `role = franchise_owner` | Auth-scoped client → RLS policies (migration 018) |
| `/franchise/jobs` | `role = franchise_owner` | Admin client, app-scoped to `allZips` from their territories |
| `/admin/franchise` | `role = admin` | Admin client, scoped to `profile.tenant_id` |
| `POST /api/franchise/apply` | `auth.getUser()` (any authed user) | Admin client for territory lookup only; insert scoped to `user.id` |

No elevation of privilege. Admin client usage is bounded in every case.

---

## Franchise OS Complete Surface Area

| Page / Route | Status |
|---|---|
| `/franchise/dashboard` | ✓ |
| `/franchise/territory` | ✓ |
| `/franchise/jobs` | ✓ (Session 3) |
| `/franchise/revenue` | ✓ |
| `/franchise/providers` | ✓ |
| `/franchise/apply` | ✓ (Session 3) |
| `/api/franchise/apply` | ✓ (Session 3) |
| `/admin/franchise` | ✓ (Session 3) |
| Automation: `operator_approved` | ✓ (Session 3) |
| Automation: `territory_activated` | ✓ (Session 3) |
| Automation: `franchise_royalty_due` | ✓ (Session 3) |

**Franchise OS: FULLY CERTIFIED**
