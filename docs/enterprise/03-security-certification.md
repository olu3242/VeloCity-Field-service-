# Security Certification Report

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Source audit:** `docs/security-audit.md`  
**Status:** MVP-ready with documented limitations

---

## 1. Authentication

**Provider:** Supabase Auth via `@supabase/ssr`  
**Session model:** Cookie-based (HTTP-only, Secure, SameSite=Lax). No JWT stored in localStorage. No token exposure in client-side JavaScript bundles.

All server-side auth uses `createServerClient` from `@supabase/ssr`, called in:
- `src/middleware.ts` — session refresh on every request
- Server Components and API route handlers

Browser-side auth uses `createBrowserClient` in `src/lib/supabase/client.ts`, restricted to realtime subscriptions and client-initiated auth flows (login/signup forms). Read-only; no admin operations.

**Auth gate in middleware (`src/middleware.ts`):**

Every request passes through `supabase.auth.getUser()`. Protected path prefixes:

| Path prefix | Auth requirement |
|---|---|
| `/dashboard` | Any authenticated user |
| `/provider` | Authenticated; role = `provider` |
| `/admin` | Authenticated; role = `admin` or `super_admin` |
| `/dispatch` | Authenticated; role = `dispatcher`, `admin`, or `super_admin` |
| `/franchise` | Authenticated; role = `franchise_owner`, `admin`, or `super_admin` |

Unauthenticated requests to protected paths are redirected to `/auth/login`. Authenticated users at `/auth/login` or `/auth/signup` are redirected to `/dashboard`.

**Middleware bypass condition:** If `NEXT_PUBLIC_SUPABASE_URL` is absent or contains the string `"placeholder"`, middleware skips auth checks and only applies security headers. This is intentional for preview deployments without Supabase configured. Production deployments must have the variable set.

---

## 2. Authorization

### Role-Based Access Control (RBAC)

Roles are stored in the `profiles` table (`role` column, `user_role` enum). Middleware reads role from the database on every role-gated request. The role enum includes: `customer`, `provider`, `admin`. The `super_admin` and `franchise_owner` roles are handled in middleware via string comparison (not in the TypeScript enum — documented limitation).

Server-side authorization in API routes uses the persona module (`src/lib/access/`):

- `getUserPersona(userId)` — resolves role and permission overrides from the database
- `checkPermission(persona, resource, action)` — validates a `(resource, action)` pair against the persona's permission set
- `checkFieldPermission(persona, resource, field)` — validates field-level access (e.g., `stripe_account_id` visibility)
- `maskFields(data, persona, resource)` — strips unauthorized fields from API responses before sending
- `enforceRouteAccess(request, requiredPermissions)` — route-level guard callable from any API handler

### Row Level Security (RLS)

RLS policies on Supabase are the primary data isolation layer. Policy patterns:

| Table | Policy |
|---|---|
| `profiles` | Users read/update own row; admins read all |
| `jobs` | Customers read own; providers read assigned; admins read all |
| `providers` | Approved providers visible to all authenticated users; provider manages own; admins manage all |
| `payout_queue` | Providers read own pending payouts; only service_role inserts/updates |
| `audit_logs` | Insert-only for service_role; admins can read, not modify |
| `automation_dead_letters` | Admins/super_admins manage for their tenant; service_role has full access |
| `enterprise_memory` | Admin read for matching tenant; service_role full access |
| `franchise_territories` | Franchise owners see territories they operate (via territory_operators join) |
| `territory_operators` | Franchise owners see own operator rows |

RLS is enabled on all tables introduced in migrations 001 through 20260721. Verification command:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

---

## 3. Rate Limiting

Implemented as an in-memory sliding-window counter in `src/middleware.ts`. Rate limit key is `${ip}:${pathname}` where IP is extracted from the `x-forwarded-for` header (first entry).

| Route category | Path pattern | Limit | Window |
|---|---|---|---|
| Automation emit + payments | `/api/automation/emit`, `/api/payments/*` | 10 requests | 60 seconds |
| Stripe webhooks | `/api/webhooks/*` | 30 requests | 60 seconds |
| General API | All other `/api/*` | 60 requests | 60 seconds |

Rate-limited responses return HTTP 429 with `{ "error": "Too Many Requests", "retryAfter": 60 }` and a `Retry-After: 60` header.

**Known limitation:** The in-memory rate limiter uses a module-level `Map` (`rateLimitStore`). State is not shared across Vercel serverless function instances and resets on cold start. This is acceptable for single-instance MVP deployments. Before horizontal scaling, replace with an Upstash Redis-backed rate limiter.

Non-API routes (static assets, page routes) are not rate-limited at the middleware level.

---

## 4. Security Headers

Applied by `applySecurityHeaders()` to every response, including 429 and redirects:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `1; mode=block` |

**Gap:** No `Content-Security-Policy` header is currently configured. This is a documented medium-severity finding. Add CSP in `next.config.js` or via Vercel response headers before high-traffic launch.

---

## 5. Tenant Isolation

Tenant isolation is enforced at two layers: application code and RLS.

**Application layer (`src/lib/tenancy.ts`):**

`getTenantId(profile)` — throws `Error("TENANT_RESOLUTION_FAILED: ...")` with `code = "TENANT_RESOLUTION_FAILED"` and `statusCode = 500` when `profile.tenant_id` is null or undefined. There is no silent fallback for user-facing requests. A missing tenant assignment is treated as a data integrity failure, not a recoverable condition.

`getTenantIdOrDefault(tenantIdOrNull, context)` — returns `DEFAULT_TENANT_ID` (`00000000-0000-4000-8000-000000000001`) when the value is null, and always emits:
```
[TENANT_FALLBACK] context="<caller context>" — no tenant_id found, falling back to DEFAULT_TENANT_ID. Verify this is expected.
```
This function is reserved for contexts that cannot assert a user tenant: Stripe webhook handlers, cron jobs, and the automation queue worker.

`withTenant(tenantId, data)` — merges `tenant_id` into every Supabase insert payload.

**RLS layer:** All tenant-scoped tables enforce `tenant_id` matches via RLS policies. Even if application code has a bug, RLS prevents cross-tenant reads or writes from user-facing clients.

**Tenant-aware rate limiting:** The middleware uses the `x-tenant-id` request header as a rate key override when present, allowing per-tenant rate tracking for multi-tenant API consumers.

---

## 6. Webhook Security

### Stripe Webhooks (`/api/webhooks/stripe`)

All Stripe webhook events are verified using:
```typescript
stripe.webhooks.constructWebhookEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
```

The raw request body is read before any JSON parsing to preserve the exact byte sequence required for HMAC verification. Requests with invalid or missing signatures receive HTTP 400. The `STRIPE_WEBHOOK_SECRET` is validated at startup by `src/env.ts`.

Stripe events processed: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_method.attached`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated` (Stripe Connect), `payout.*`.

Tenant resolution in webhook handler uses `getTenantIdOrDefault(metadata?.tenant_id, "stripe-webhook/<event_type>")` — all fallbacks are logged.

---

## 7. API Key Management

All API keys are validated at startup by the Zod schema in `src/env.ts`. Keys are never logged, never included in error responses, and never re-exported from barrels that could end up in the client bundle.

`SUPABASE_SERVICE_ROLE_KEY` is accessed only through `src/lib/supabase/admin.ts` (`getAdminClient()`). This export is not re-exported from any client-accessible barrel.

Cron route authentication: all cron routes require `Authorization: Bearer ${CRON_SECRET}`. The `CRON_SECRET` is required at startup and is a separate secret from all Supabase and Stripe keys.

---

## 8. Error Handling and Information Exposure

**Error boundaries:** Segment-level error boundaries exist for all four portals:
- `src/app/dashboard/error.tsx`
- `src/app/provider/error.tsx`
- `src/app/admin/error.tsx` (shows Vercel error digest in all environments for support reference)
- `src/app/franchise/error.tsx`

Stack traces and raw `error.message` are displayed only in `NODE_ENV === "development"`. Production shows a generic message plus the Vercel error digest.

**API error responses:** All API routes use `handleApiError()` from `src/lib/api-response.ts`, which returns structured `{ success: false, error: { code, message }, correlationId }` envelopes. Raw stack traces never reach the client in production. Full error objects are logged server-side only.

**Zod validation:** Invalid request bodies receive HTTP 422 with `{ code: "VALIDATION_ERROR", details: [...] }`. Zod error details are included for debugging but are not logged at error level (they are client errors).

---

## 9. Dependency Security Notes

| Issue | Detail |
|---|---|
| `--legacy-peer-deps` required | Stripe `@stripe/stripe-js` version conflict with peer dependencies. Build passes but peer dep warnings are present. Resolve when Stripe SDK updates. |
| `super_admin` not in TypeScript enum | The `user_role` enum in the database and types includes `customer`, `provider`, `admin`. `super_admin` is handled in middleware via string comparison. Add to enum before building super-admin UI. |

---

## 10. Known Limitations and Risk Register

| Risk | Severity | Status |
|---|---|---|
| In-memory rate limiter not shared across instances | Medium | Acceptable for MVP. Requires Redis before horizontal scaling. |
| No Content-Security-Policy header | Medium | Open. Add before high-traffic launch. |
| RLS policies are the primary isolation layer — no secondary application-level tenant filter on all queries | High | Mitigated by RLS review in migration 018. Run `pg_tables` rowsecurity check before launch. |
| `super_admin` role not in TypeScript type union | Low | String comparison in middleware is correct; TypeScript gap. |
| Middleware skipped when Supabase env vars absent | Low | Intentional for preview. Ensure vars set in production. |
| Twilio/SendGrid optional — users may not receive notifications | Medium | Platform functional without them. Configure before launch. |
| No CSP | Medium | Documented. Add next sprint. |
