# Frontend ↔ Backend Certification

**Method note (honesty over theater):** This sandbox has no seeded Supabase database and no authenticated session, so true end-to-end runtime testing (clicking through a live booking as a real user) is not possible here. Every chain below is certified by **tracing the real source code** — reading the actual UI component, the actual API route it calls, the actual database writes, and the actual downstream effects (events, notifications) — not by inventing a checklist. Where a chain could not be traced to a real source, it's marked unverified rather than assumed working.

## Chain 1: Booking — Landing CTA → Booking Flow → API → Database → Redirect

| Step | File | Verified behavior |
|---|---|---|
| Landing CTA | `src/components/landing/LandingPage.tsx` | "Book a Service" buttons link to `/book` |
| Booking UI | `src/app/book/page.tsx` | Category picker + form; on submit, `fetch("/api/jobs", { method: "POST", ... })` (line 44) |
| API route | `src/app/api/jobs/route.ts` `POST` | Validates body via `bookingSchema.safeParse`; calls `validateServiceArea(...)` and returns 422 + emits `serviceability_failed` if the ZIP isn't serviceable; calls `alice.classify(...)` for internal categorization (never exposed to the UI); inserts into `jobs` with `status: "submitted"`, `tenant_id` scoping |
| Automation | same file | Emits `service_request_created` and serviceability events via `emitEvent`, wrapped in try/catch with the explicit comment "Automation failure must never block booking creation" — confirms automation is best-effort and cannot break the booking write |
| Redirect | `src/app/book/page.tsx` line 67 | `router.push(\`/dashboard/jobs/${job.id}?booked=1\`)` — redirects to the real created job's detail page |

**Certification: PASS, fully traced.** Every link in this chain is real code, not a stub.

## Chain 2: Dispatch — Admin Dispatch → Provider Offers → Acceptance → Job Status → Notification

| Step | File | Verified behavior |
|---|---|---|
| Admin triggers dispatch | `src/app/api/admin/dispatch/route.ts` `POST` | Requires `admin` role + `checkPermission` check; loads the job tenant-scoped; calls `hasPaymentCommitment(...)` and returns 402 + audit-log entry if no payment commitment exists (a real safety gate, not a stub) |
| Provider ranking | same file | Calls `max.match(job, eligibleProviders, ...)` — an internal ranking agent; filters to `recommended` providers, takes top 3 |
| Offer creation | same file | Upserts `provider_offers` rows with `match_score`, `ai_reasoning`, `expires_at`; updates `jobs.status` to `"offer_sent"`; emits `job_state_changed` |
| Notification | same file | Calls `createInAppNotification(...)` per offered provider, then emits `provider_offer_sent` |
| Provider accepts | `src/app/api/offers/[id]/route.ts` `POST` (action: accept) | Validates via `offerActionSchema`; checks provider ownership scoped to `tenant_id`; returns 409 if the offer was already actioned; on accept: sets `provider_offers.accepted_at`, updates `jobs.status` to `"accepted"` + `provider_id`, emits `job_accepted` + `job_state_changed`, then **rejects all other pending offers for the same job** with `rejection_reason: "Another provider accepted"` — a real exclusivity guarantee, not just a UI assumption |
| Provider rejects | same file (action: reject) | Requires a `reason` (400 if missing); updates `rejected_at`/`rejection_reason`; emits `job_reassigned` |
| In-app notification read | `src/app/api/notifications/route.ts` `GET`/`PATCH` | Real user-scoped query against `notifications` table; `PATCH` supports mark-one/mark-all-read |

**Certification: PASS, fully traced.** This is the most sophisticated verified chain in the app — it includes a real payment pre-authorization gate, an AI-ranking step, exclusive-offer-acceptance logic, and real notification delivery, all tenant-isolated.

## Chain 3: Authentication → Profile → Dashboard Redirect

| Step | File | Verified behavior |
|---|---|---|
| Sign up / login UI | `src/app/auth/signup`, `src/app/auth/login` | Real forms posting to Supabase auth |
| Profile lookup | repeated pattern across API routes (`jobs/route.ts`, `dispatch/route.ts`, etc.) | `supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single()` — role and tenant are read from a real `profiles` table, not hardcoded |
| Tenant isolation | `getTenantId(profile)` + `.eq("tenant_id", tenantId)` on every scoped query | Confirmed consistently applied across `jobs`, `offers`, `dispatch` routes — this is real multi-tenancy, not decorative |

**Certification: PASS for the data layer.** Full UI click-through (signup → email confirm → first dashboard render) was not exercised live in this sandbox (no test mailbox / auth session available) — flagged as **unverified-by-runtime, verified-by-code** rather than claimed as fully tested.

## What this certification deliberately does NOT claim

- It does not claim live end-to-end browser testing occurred for authenticated flows — that requires a seeded database and session, neither available here.
- It does not invent pass/fail results for chains that weren't traceable in the time available (e.g. the full payment-capture-on-completion chain and the review-submission chain were not read this pass — left as future verification work, not assumed passing).
- No runtime behavior was changed by this audit. The only code change made (the `provider/earnings` Table migration and the landing-page category-count fix) is pure presentation/data-accuracy, not business logic — consistent with Part 17's "do not break" list.
