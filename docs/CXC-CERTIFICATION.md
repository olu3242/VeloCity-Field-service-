# Customer Experience Certification (CXC) — Velocity Field Service OS

**Type:** Implementation audit. Not a feature specification.
**Scope:** The customer-facing surface of this repository as it exists at the commit this document was added.
**Method:** Every statement below is derived from reading the source. Each finding carries a file path. Where a capability is absent, the absence was established by searching for it and finding nothing — that search is cited too.

A capability is only marked **Complete** when UI, API, persistence, validation, authorization, error handling and audit trail were all located. A page existing is not completion.

---

## 1. Platform shape (measured)

| Measure | Count | How counted |
|---|---|---|
| Pages (`page.tsx`) | 80 | `find src/app -name page.tsx` |
| API routes (`route.ts`) | 175 | `find src/app/api -name route.ts` |
| Admin/operator routes | 130 | `src/app/api/admin/**` |
| Non-admin routes | 45 | remainder |
| Customer pages (`/dashboard/**`) | 11 | see §3 |
| React components (`.tsx`) | 161 | `find src -name '*.tsx'` |

**Headline ratio: 130 operator routes to roughly 14 genuinely customer-facing ones.** The platform is an operator system with a customer portal attached, not a customer product with an operator back office. Every gap in this report is downstream of that ratio.

---

## 2. Deliverable 1 — Customer Journey Map (as implemented)

| # | Journey stage | Implemented? | Evidence |
|---|---|---|---|
| 1 | Visitor / landing | ✅ | `src/app/page.tsx` → `src/components/landing/LandingPage.tsx`; server-rendered with live stats from `getAdminClient()` |
| 2 | Service discovery | ⚠️ Partial | Categories from `SERVICE_CATEGORY_LABELS` (`src/lib/utils`); no browse/search page, no provider directory |
| 3 | Registration | ✅ | `src/app/auth/signup/page.tsx` (Supabase `signUp`, `emailRedirectTo: /auth/callback`) |
| 4 | Email verification | ⚠️ Partial | `emailRedirectTo` is set (`signup/page.tsx:30`) but no verification-status UI and no resend path |
| 5 | Authentication | ✅ | `src/app/auth/login/page.tsx` |
| 6 | Password recovery | ❌ **Absent** | No `resetPasswordForEmail`, no `/auth/forgot-password`, no `updateUser` call anywhere in `src/app` or `src/components` |
| 7 | Profile management | ❌ **Absent** | No page under `src/app/dashboard/` for profile or settings; `ls src/app/dashboard` → commercial, disputes, jobs, membership, notifications only |
| 8 | Dashboard | ✅ | `src/app/dashboard/page.tsx` — jobs, membership summary, commercial summary |
| 9 | Booking | ✅ | `src/app/book/page.tsx` (380 lines, multi-step wizard) → `POST /api/jobs` |
| 10 | Intake classification | ✅ | `src/app/api/jobs/route.ts:95` — `alice.classify(...)` |
| 11 | Scheduling | ⚠️ Partial | Booking captures `preferredDate` only; no slot picker, no availability lookup, no reschedule UI |
| 12 | Provider matching | ✅ (server) | `emitEvent` → `handleMaxDispatch` (`src/lib/automation/handlers/max-dispatch.ts`); customer sees the result, not the process |
| 13 | Quote review | ✅ | `src/components/jobs/quote-actions.tsx` → `POST /api/quotes/[id]` |
| 14 | Live tracking | ❌ **Absent for the customer** | Provider posts location via `POST /api/jobs/[id]/check-in`; nothing renders it for the customer. `/api/live` is a Kubernetes liveness probe (`src/app/api/live/route.ts`), not tracking |
| 15 | In-job communication | ⚠️ Partial | `src/components/jobs/message-panel.tsx` — send works, but reads are server-rendered and refreshed by `router.refresh()`; no subscription, no polling |
| 16 | Photo evidence | ✅ | `src/components/jobs/photo-upload-form.tsx` → `POST /api/jobs/[id]/photos` |
| 17 | Payment | ✅ | `src/app/dashboard/jobs/[id]/pay/page.tsx` — Stripe Elements → `POST /api/payments/intent` |
| 18 | Saved payment methods | ❌ **Absent** | No `SetupIntent` anywhere; `src/lib/stripe/client.ts:55` uses `automatic_payment_methods` per-transaction only |
| 19 | Receipt / invoice access | ❌ **Absent for the customer** | `receipts` is read in `src/app/admin/jobs/[id]/page.tsx:54` and `src/app/api/admin/finance/route.ts:48`. No customer route reads it |
| 20 | Tipping | ✅ | `src/components/jobs/tip-provider.tsx` → `GET/POST /api/tips` |
| 21 | Review | ✅ | `src/app/dashboard/jobs/[id]/review/page.tsx` → `POST /api/reviews` |
| 22 | Dispute | ✅ | `src/app/dashboard/disputes/` (list + detail + `NewDisputeForm`) → `POST /api/disputes` |
| 23 | Membership | ⚠️ Read-only | `src/app/dashboard/membership/page.tsx` renders `computeCustomerMembershipSummary`. No non-admin membership route exists — subscribe, upgrade and cancel are operator-only (`src/app/api/admin/memberships/route.ts`) |
| 24 | Loyalty / rewards | ❌ **No customer surface** | Engines exist — `src/lib/retention/loyaltyOfferEngine.ts`, `src/lib/relationship/reward-currency.ts` — exposed only through `/api/admin/loyalty`, `/api/admin/retention`, `/api/admin/referrals` |
| 25 | Referral | ❌ **No customer surface** | `src/app/api/admin/referrals/route.ts` only |
| 26 | Rebooking / repeat | ❌ **Absent** | No "book again" affordance; `src/lib/forms/smart-defaults.ts` registers `preferred_provider` and `previous_address` rules, but `src/app/book/page.tsx` never calls the defaults engine |
| 27 | Notifications | ✅ | `src/app/dashboard/notifications/page.tsx` → `GET/PATCH /api/notifications` |
| 28 | Account closure / data export | ❌ **Absent** | No delete-account or export route outside admin |

**Journey coverage: 14 of 28 stages complete, 5 partial, 9 absent.**

---

## 3. Deliverable 2 — Screen Inventory (customer)

| Route | File | Rendering | Auth | Notes |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Server, `force-dynamic` | Public | Falls back to `EMPTY_STATS` when env group missing |
| `/auth/login` | `auth/login/page.tsx` | Client | Public | No password-reset link |
| `/auth/signup` | `auth/signup/page.tsx` | Client | Public | |
| `/book` | `book/page.tsx` | Client | Public → auth at submit | 4-step wizard; the only Suspense-wrapped page |
| `/dashboard` | `dashboard/page.tsx` | Server | `redirect()` on no user | |
| `/dashboard/jobs` | `dashboard/jobs/page.tsx` | Server | `redirect()` | Status filter via `searchParams` |
| `/dashboard/jobs/[id]` | `dashboard/jobs/[id]/page.tsx` | Server | `redirect()` + `notFound()` | Composes quote / tip / messages / photos |
| `/dashboard/jobs/[id]/pay` | `.../pay/page.tsx` | Client | Client-side only | See §7 finding CX-P1 |
| `/dashboard/jobs/[id]/review` | `.../review/page.tsx` | Server | `redirect()` + `notFound()` | |
| `/dashboard/membership` | `dashboard/membership/page.tsx` | Server | `redirect()` | Read-only |
| `/dashboard/commercial` | `dashboard/commercial/page.tsx` | Server | `redirect()` | B2B account view |
| `/dashboard/disputes` | `dashboard/disputes/page.tsx` | Server | `redirect()` | |
| `/dashboard/disputes/[id]` | `dashboard/disputes/[id]/page.tsx` | Server | `redirect()` | |
| `/dashboard/notifications` | `dashboard/notifications/page.tsx` | Client | API-enforced | |

Supporting shells present: `src/app/dashboard/layout.tsx`, `loading.tsx`, `error.tsx`; global `src/app/error.tsx`, `src/app/not-found.tsx`.

---

## 4. Deliverable 3 — Customer API Inventory

| Route | Methods | Authorization mechanism | File |
|---|---|---|---|
| `/api/jobs` | GET, POST | `auth.getUser()` + `getTenantId(profile)` | `api/jobs/route.ts` |
| `/api/jobs/[id]` | GET, PATCH | user + tenant + `customer_id` ownership | `api/jobs/[id]/route.ts` |
| `/api/jobs/[id]/transition` | POST | role-aware; customer must own the job (`transition/route.ts:48`) | |
| `/api/jobs/[id]/messages` | GET, POST | participant check | |
| `/api/jobs/[id]/photos` | POST | participant check | |
| `/api/jobs/[id]/check-in` | POST | **provider only** (`check-in/route.ts:15`) | |
| `/api/quotes`, `/api/quotes/[id]` | POST | provider creates, customer accepts/declines | |
| `/api/payments/intent` | POST | user + ownership | |
| `/api/reviews` | POST | user + completed-job check | |
| `/api/disputes` | POST | user + job ownership | |
| `/api/tips` | GET, POST | `.eq("customer_id", user.id)` | |
| `/api/notifications` | GET, PATCH | `.eq("user_id", user.id)` | |
| `/api/service-types` | GET | public read | |
| `/api/offers`, `/api/offers/[id]` | — | provider-side | |
| `/api/providers/me`, `/api/providers/[id]/status` | — | provider-side | |
| `/api/franchise/apply` | POST | public application | |
| `/api/webhooks/stripe` | POST | signature-verified | |

**No customer-facing route exists for:** profile, addresses, payment methods, membership mutation, loyalty, referrals, receipts, data export, account deletion.

---

## 5. Deliverable 4 — Customer State Machine

Canonical and single-sourced: `src/lib/workflows/job-state-machine.ts`.

- `JOB_TRANSITIONS` — declarative `{from, to, roles, requiresReason}` edge list
- `TERMINAL_STATES` = `closed, cancelled, expired, refunded` (line 127)
- `CUSTOMER_ACTION_STATES` (line 140) / `PROVIDER_ACTION_STATES` (line 148)
- `getJobProgressPercent()` (line 160) drives progress display

Enforcement is server-side in `POST /api/jobs/[id]/transition`, which checks in order: authentication → schema (`transitionSchema`) → tenant scope → role ownership → `canTransition()` → reason requirement → `checkGovernance()` → `emitEvent()`.

**This is the strongest component in the customer path.** No parallel transition logic was found elsewhere; the machine is not duplicated.

---

## 6. Deliverable 5 — Automation & AI Capability Matrix

16 handlers under `src/lib/automation/handlers/`, dispatched by `src/lib/automation/router.ts`, each gated by `isAgentEnabled()` and a circuit breaker (`isOpen`/`recordSuccess`/`recordFailure`, router lines 51-73).

| Agent | Handler | Customer-visible? |
|---|---|---|
| Alice (intake) | `alice-intake.ts` | Indirect — classification affects routing |
| Max (dispatch) | `max-dispatch.ts` | Indirect |
| Nova (workflow) | `nova-workflow.ts` | Indirect |
| Quinn (quote) | `quinn-quote.ts` | Yes — quote arrives |
| Finn (payment) | `finn-payment.ts` | Yes |
| Rex (completion) | `rex-completion.ts` | Yes |
| Ivy (dispute) | `ivy-dispute.ts` | Yes |
| Lena (retention) | `lena-retention.ts` | Notification only |
| Tess (territory) | `tess-territory.ts` | No |
| + 7 more (payout, offer, SLA, tip, membership, franchise, predictive) | | Mixed |

**Finding AI-1 — there is no customer-facing AI surface at all.** Searching `src/` for `concierge|Concierge` returns nothing. All 11 agents in `src/lib/agents/` are server-side automation invoked from handlers. The customer cannot ask a question, get a recommendation, or receive an explanation. The AI is entirely operator-directed.

**Finding AI-2 — the IDXF smart-defaults engine is not wired to the customer.** `src/lib/forms/smart-defaults.ts` registers `preferred_provider`, `previous_address`, `next_available_slot`, `preferred_payment`, `nearest_territory` — exactly the intelligence a returning customer should feel. `src/app/book/page.tsx` initialises all state to empty strings and never calls `resolveDefaults`.

---

## 7. Deliverable 6 — UX Audit

**CX-P1 — the payment page trusts the client.** `src/app/dashboard/jobs/[id]/pay/page.tsx` is `"use client"` and fetches the intent on mount. Unlike every other `/dashboard` page it performs no server-side `redirect()`. Authorization still holds, because `POST /api/payments/intent` verifies ownership — but an unauthenticated visitor reaches a rendering payment shell and only then sees a failure. Inconsistent with the rest of the dashboard.

**CX-P2 — messaging does not update.** `message-panel.tsx` receives `messages` as a prop from the server component and calls `router.refresh()` after sending. A message from the provider appears only if the customer reloads. `src/components/realtime/RealtimeJobUpdates.tsx` already implements the correct pattern (`supabase.channel(...).on("postgres_changes", ...)`, lines 36-48) — it is simply not applied to messages.

**CX-P3 — booking has no persistence.** All 12 `useState` fields in `BookingForm` are in-memory. Navigating away mid-wizard loses everything.

**CX-P4 — no reschedule or self-cancel affordance** was found in any customer page, despite the state machine defining customer-role transitions.

---

## 8. Deliverable 7 — Accessibility Report

**Finding A11Y-1 (systemic).** Across 161 `.tsx` files, only **2** contain any `aria-` attribute. There is no skip link, no `<main>` landmark convention, no focus-trap in any interactive component, and no `role` usage in the job, dispute or booking flows.

Specific defects located:
- `message-panel.tsx` — bare `<textarea>` with a placeholder and no `<label>` or `aria-label`
- `book/page.tsx` — step transitions do not move focus or announce; a screen-reader user gets no signal that step changed
- Status is conveyed by `Badge` colour alone in `dashboard/jobs/page.tsx` and `disputes/page.tsx`

This is the single largest enterprise-readiness gap in the customer surface, and it is not a per-page fix — it needs a pass over `src/components/ui/`.

---

## 9. Deliverable 8 — Communications Review

`src/lib/notifications/server.ts` implements three channels correctly:
- in-app → `notifications` table (always)
- email → SendGrid, guarded by `hasEnvGroup("email")`
- SMS → Twilio, guarded by `hasEnvGroup("sms")`

**Finding COMM-1 — `sendNotification` does not isolate channel failure.** Lines 38-56: `sgMail.send()` and `client.messages.create()` are awaited unguarded. A SendGrid outage throws out of `sendNotification`, which propagates into the automation handler that called it. The in-app notification is already written by then, so the customer record is correct — but the calling handler fails and retries, and on retry the in-app row is written again. Wrapping each external send in its own try/catch would make delivery best-effort per channel, which is the intended semantic.

**Finding COMM-2 — no notification preferences.** The customer cannot opt out of email or SMS. There is no preferences table read and no settings UI. For a platform sending transactional SMS this is a compliance exposure, not just a UX gap.

---

## 10. Deliverable 9 — Security & Authorization Review

Verified working:
- Middleware (`src/middleware.ts`) applies `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` to every response
- Tenant-aware distributed rate limiting with in-memory fallback; payments and `automation/emit` limited to 10/min
- Every customer route calls `auth.getUser()` before reading data
- Tenant scoping via `.eq("tenant_id", tenantId)` on job/dispute/quote reads
- Ownership scoping via `.eq("customer_id", user.id)` / `.eq("user_id", user.id)`
- Stripe webhook is signature-verified and handles 9 event types with dedup keys
- `npm run audit:security` enforces tenant-insert, fail-open-auth, route-auth and service-role invariants in CI

No new authorization defect was found in the customer path during this audit.

---

## 11. Deliverable 10 — Certification Scorecard

| Dimension | Score | Basis |
|---|---:|---|
| Job lifecycle & state machine | 9/10 | Single-sourced, server-enforced, role-aware |
| Payments | 8/10 | Stripe correct end to end; no saved methods, no customer receipts |
| Security & tenancy | 8/10 | Consistent, CI-enforced; CX-P1 is a consistency defect not a hole |
| Booking | 7/10 | Complete and validated; no defaults, no persistence, no slot picker |
| Disputes | 7/10 | Full loop implemented |
| Reviews & tips | 7/10 | Complete |
| Notifications | 6/10 | Three channels; COMM-1 and COMM-2 open |
| Automation | 7/10 | Strong server-side; invisible to the customer |
| Communication (messaging) | 4/10 | Send-only without live read |
| Membership | 3/10 | Read-only; all mutation is operator-gated |
| Identity & account management | 2/10 | No password reset, no profile, no preferences |
| Customer intelligence / AI | 2/10 | Engines exist; zero customer surface |
| Loyalty & retention | 1/10 | Admin-only |
| Accessibility | 1/10 | 2 of 161 components |
| **Overall CX score** | **5.2 / 10** | Weighted mean |

**Certification verdict: NOT CERTIFIED.** Blocking item is CX-1 (password recovery) — a production platform that cannot recover an account is not shippable to consumers regardless of the rest.

---

## 12. Deliverable 11 — Prioritized Roadmap

**P0 — blocking**
1. **CX-1** Password recovery: `/auth/forgot-password` + `/auth/reset-password` using `resetPasswordForEmail` / `updateUser`, and a link on `auth/login/page.tsx`.
2. **CX-2** Customer profile page `/dashboard/profile` + `GET/PATCH /api/profile` — name, phone, email, notification preferences (closes COMM-2).
3. **COMM-1** Per-channel try/catch in `notifications/server.ts` so one provider outage cannot fail a handler.

**P1 — high**
4. **CX-3** Membership self-service: `POST /api/memberships` for subscribe/upgrade/cancel, reusing `computeCustomerMembershipSummary` and the existing Stripe subscription code in `stripe/client.ts:144`.
5. **CX-4** Live messaging: apply the `RealtimeJobUpdates` channel pattern to `message-panel.tsx`.
6. **A11Y-1** Accessibility pass over `src/components/ui/` — labels, landmarks, focus management, non-colour status.
7. **CX-5** Customer receipts: `GET /api/receipts?job_id=` scoped by `customer_id`, surfaced on the job detail page.

**P2 — medium**
8. **AI-2** Wire `resolveDefaults` into `/book` — the engine is built, tested and unused. Highest intelligence-per-line-of-code available in the repo.
9. **CX-6** Saved payment methods via `SetupIntent`.
10. **CX-7** Reschedule / self-cancel UI over the existing customer transitions.
11. **CX-8** Live job tracking for the customer from the check-in data already being persisted.

**P3 — strategic**
12. **AI-1** Customer AI concierge over the existing agent layer.
13. **CX-9** Loyalty and referral customer surfaces over `loyaltyOfferEngine` and `reward-currency`.
14. **CX-10** Booking draft persistence and rebooking.
15. **CX-11** Data export and account deletion (GDPR/CCPA).

---

## 13. Consolidation opportunities

Per the instruction to reuse before introducing:

- **Do not build a new defaults mechanism for booking.** `src/lib/forms/smart-defaults.ts` is the engine.
- **Do not build a second realtime path.** `src/components/realtime/` already has the channel pattern.
- **Do not build a second state machine.** `job-state-machine.ts` is canonical; reschedule/cancel are transitions, not new flows.
- **Do not build a new notification sender.** `sendNotification` is the single entry point; it needs hardening, not replacement.
- **Membership mutation should call the same Stripe subscription helpers** the admin route uses, not a parallel implementation.

---

## 14. What this audit did not cover

Stated explicitly so the scorecard is not read as broader than it is:

- No runtime testing against a live Supabase instance — findings are static.
- Performance is not measured; no load testing was run. The "Performance Review" deliverable is therefore **not produced** rather than estimated.
- Mobile behaviour was assessed from Tailwind breakpoint classes only, not on devices.
- RLS policies in `supabase/migrations/` were not re-verified; application-layer scoping was.
- Provider, franchise and dispatch experiences are out of scope — this is the customer certification.
