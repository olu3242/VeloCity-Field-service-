# VeloCity Field Service — Security Audit

> Sprint: Production Hardening  
> Date: 2026-07-21  
> Status: MVP-ready with documented limitations

---

## Authentication

**Provider:** Supabase SSR Auth (`@supabase/ssr`)  
**Session model:** Cookie-based (HTTP-only, Secure, SameSite=Lax) — no localStorage tokens exposed in client code  
**Server client:** `createServerClient` called in middleware, Server Components, and API routes; never in Client Components  
**Browser client:** `createBrowserClient` in `src/lib/supabase/client.ts` — read-only, used only for realtime subscriptions and client-initiated auth flows

### Middleware auth gate (`src/middleware.ts`)

All requests pass through the Supabase middleware to refresh session tokens. Protected path prefixes:

```
/dashboard    — requires authenticated user (any role)
/provider     — requires authenticated user; role must be "provider"
/admin        — requires authenticated user; role must be "admin" or "super_admin"
/dispatch     — requires authenticated user; role must be "dispatcher", "admin", or "super_admin"
/franchise    — requires authenticated user; role must be "franchise_owner", "admin", or "super_admin"
```

Unauthenticated requests to protected paths are redirected to `/auth/login`. Authenticated users visiting `/auth/login` or `/auth/signup` are redirected to `/dashboard`.

If Supabase environment variables are absent or contain "placeholder", middleware is skipped entirely — this prevents startup failures in preview deployments without Supabase configured.

---

## Authorization

### RBAC — Persona Permissions

Server-side permission checks use the persona module (`src/lib/access/`):

- `getUserPersona(userId)` — resolves the user's role and custom permission overrides from the database
- `checkPermission(persona, resource, action)` — validates a `(resource, action)` pair against the persona's permission set
- `checkFieldPermission(persona, resource, field)` — validates field-level read/write access (used for sensitive fields like `stripe_account_id`)
- `maskFields(data, persona, resource)` — strips unauthorized fields from API responses before they leave the server
- `enforceRouteAccess(request, requiredPermissions)` — server-side guard used in API route handlers

### RLS — Row Level Security

Supabase RLS policies are the **primary data isolation layer**. No row is readable or writable without passing a policy check, even if an API route has a bug.

Key policy patterns:
- `profiles`: users can read their own row; admins can read all
- `jobs`: customers can read their own jobs; providers can read jobs assigned to them; admins can read all
- `providers`: providers can read/write their own record; admins can read/write all
- `payout_queue`: providers can read their own pending payouts; only service role can insert/update
- `audit_logs`: insert-only for service role; admins can read but not modify
- `tenants` / `tenant_id` columns: all tenant-scoped tables include `tenant_id = auth.uid()` or `tenant_id = (select tenant_id from profiles where id = auth.uid())` in their policies

RLS is enabled on all tables added in migrations. Verify with `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` before launch.

---

## Tenant Isolation

Tenant resolution follows a strict two-function pattern (see `src/lib/tenancy.ts`):

**`getTenantId(profile)`**
- Throws `TENANT_RESOLUTION_FAILED` (code `500`) if `profile.tenant_id` is null
- Used in all user-facing API routes
- Ensures no request silently crosses tenant boundaries

**`getTenantIdOrDefault(tenantIdOrNull, context)`**
- Falls back to `DEFAULT_TENANT_ID` (`00000000-0000-4000-8000-000000000001`) when tenant cannot be asserted
- Emits `console.warn([TENANT_FALLBACK] context="<caller>")` on every fallback
- Reserved for: Stripe webhooks, cron jobs, internal automation queue processing

All Supabase inserts use `withTenant(tenantId, data)` to inject `tenant_id` before writing.

---

## API Security

### In-Memory Rate Limiting

Rate limiting is applied in middleware using an in-memory sliding-window counter:

| Route category | Limit |
|---|---|
| General API routes | 60 requests / minute per IP |
| Auth routes (`/auth/*`, `/api/auth/*`) | 10 requests / minute per IP |

**Known limitation:** The in-memory counter resets on process restart and is not shared across Vercel function instances. This is acceptable for the single-instance MVP. A Redis-backed rate limiter (e.g., Upstash) is required before scaling to multiple instances.

### Input Validation

All API route handlers validate incoming request bodies with Zod schemas. Invalid payloads receive a `422 VALIDATION_ERROR` response. Raw Zod error details are included in the `details` field for debugging but are not logged at the `error` level (they are client errors, not server errors).

### Cron Authentication

All cron routes require the `Authorization: Bearer <CRON_SECRET>` header. Unauthenticated requests return 401. `CRON_SECRET` is validated at startup by `src/env.ts`.

### Service Role Key

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never appear in client-side code. It is accessed only through `src/lib/supabase/admin.ts` (`getAdminClient()`). The `getAdminClient()` export is not re-exported from any barrel that could end up in the client bundle.

---

## Webhook Security

### Stripe Webhooks (`/api/webhooks/stripe`)

All Stripe webhook events are verified using `stripe.webhooks.constructWebhookEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` before any payload processing. Requests with invalid signatures receive 400 and are logged. The raw body is read before any JSON parsing to preserve the exact byte sequence required for HMAC verification.

Events processed: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_method.attached`, `customer.subscription.*`, `account.updated` (Stripe Connect), `payout.*`.

---

## Environment Variable Security

All environment variables are centrally validated at startup by `src/env.ts` using a Zod schema. If any required variable is missing or malformed, the process throws before serving the first request.

### Required variables (validated at startup, hard failure if missing)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-only) |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook HMAC secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (public) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `CRON_SECRET` | Bearer token for cron route auth |

### Optional variables (features degrade gracefully if absent)

| Variable | Feature |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Absolute URL for canonical links and redirects |
| `TWILIO_ACCOUNT_SID` | SMS notifications |
| `TWILIO_AUTH_TOKEN` | SMS notifications |
| `TWILIO_PHONE_NUMBER` | SMS sender number |
| `SENDGRID_API_KEY` | Transactional email |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps embeds |
| `GOOGLE_OAUTH_CLIENT_ID` | Google social login |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google social login |

---

## Error Handling and Information Exposure

### Error boundaries

Segment-level error boundaries exist for all four major portals:

- `src/app/dashboard/error.tsx`
- `src/app/provider/error.tsx`
- `src/app/admin/error.tsx` — shows digest in all envs for support reference
- `src/app/franchise/error.tsx`

All boundaries call `console.error("[VeloCity Error]", error)` for log aggregation. Raw `error.message` and stack traces are shown only in `NODE_ENV === "development"`. The error digest (Vercel's opaque request fingerprint) is always shown in the admin boundary.

### API error responses

All API routes use `handleApiError()` from `src/lib/api-response.ts`. The function:
- Returns structured `{ success: false, error: { code, message }, correlationId }` envelopes
- Never surfaces raw stack traces in `NODE_ENV === "production"`
- Logs full error objects server-side; clients receive sanitized messages

---

## Known Limitations and Remaining Risks

| Risk | Severity | Mitigation / Status |
|---|---|---|
| In-memory rate limiter resets on process restart | Medium | Acceptable for single-instance MVP. Add Redis (Upstash) before horizontal scaling. |
| RLS policies are the primary isolation layer | High | Policies were reviewed during the franchise-os-rls migration (018). Run full RLS verification before launch — see launch checklist. |
| `super_admin` role is not in the `profiles` type definition | Low | Middleware handles it via string comparison. Add to the TypeScript union before adding super-admin UI. |
| Middleware skipped when Supabase env vars absent | Low | Intentional for preview deploys. Ensure vars are set in production. |
| Anthropic API key — no fallback for agent calls in production | Medium | All agents have deterministic fallbacks. If `ANTHROPIC_API_KEY` is unset, agents return rule-based outputs. |
| Twilio/SendGrid are optional — users may not receive notifications | Medium | Platform is functional without them; notifications are silently skipped. Configure both before launch. |
| Google Maps API key absence breaks map-based job location UI | Low | Pages render without the map widget if key is absent. |
| No CSP headers configured | Medium | Add `Content-Security-Policy` response headers in Next.js config or via Vercel headers before launch. |
