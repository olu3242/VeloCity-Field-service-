# Deployment Runbook

## Pre-Deployment Checklist

Run `GET /api/admin/launch-readiness` after each step to verify. The response has `overall: "ready" | "blocked" | "warnings"`.

---

## Step 1: Supabase Setup

### 1a. Run migrations

```bash
# Link to production project
supabase link --project-ref <your-project-ref>

# Push all migrations
supabase db push

# Verify key tables exist
supabase db diff --linked
```

Expected tables after migration:
- `profiles`, `jobs`, `providers`, `payments`, `bookings`
- `system_events`, `revenue_records`, `enterprise_memory`
- `commission_ledger`, `metered_usage_events`
- `automation_queue`, `dead_letter_queue`

### 1b. Enable Google OAuth (if using Google sign-in)

1. Go to Supabase Dashboard → Authentication → Providers → Google
2. Enable Google
3. Set Client ID and Client Secret from Google Cloud Console
4. Add authorized redirect URI: `https://<your-domain>/auth/callback`

### 1c. Confirm RLS is enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('jobs', 'profiles', 'payments', 'providers', 'revenue_records')
ORDER BY tablename;
```

All rows should show `rowsecurity = true`.

---

## Step 2: Environment Variables

Copy `.env.example` → `.env.local` for local, set in Vercel Dashboard → Settings → Environment Variables for production.

### Required (deployment is blocked without these)

| Variable | Where to find |
|----------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks (see Step 3) |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Your production domain (e.g. `https://velocity.app`) |

### Optional (graceful fallback if absent)

| Variable | Purpose | Default behavior |
|----------|---------|-----------------|
| `UPSTASH_REDIS_REST_URL` + `TOKEN` | Distributed rate limiting, locking, circuit breakers | In-memory (single-instance) |
| `TWILIO_*` | SMS notifications | Notifications skipped |
| `SENDGRID_API_KEY` | Email notifications | Email skipped |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Map display | Map hidden |

---

## Step 3: Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://<your-domain>/api/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `transfer.created`
   - `transfer.failed`
4. Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

Or push to main branch with GitHub integration enabled.

After deployment, verify:
- `GET https://<your-domain>/api/health` returns `{ status: "ok" }`
- `GET https://<your-domain>/api/live` returns `{ alive: true }`
- `GET https://<your-domain>/api/ready` returns `{ ready: true }`

---

## Step 5: Cron Jobs

Configure these cron jobs in Vercel Dashboard → Settings → Cron Jobs or via `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/daily",              "schedule": "0 6 * * *" },
    { "path": "/api/cron/sla",                "schedule": "*/30 * * * *" },
    { "path": "/api/cron/payouts",            "schedule": "0 2 * * *" },
    { "path": "/api/cron/daily-intelligence", "schedule": "0 4 * * *" },
    { "path": "/api/cron/revenue",            "schedule": "0 3 * * *" }
  ]
}
```

All cron requests must include `Authorization: Bearer <CRON_SECRET>`.

---

## Step 6: Upstash Redis (Optional but Recommended)

Without Redis, the platform operates in single-instance mode with in-memory rate limiting and circuit breakers. For production traffic:

1. Create a Redis database at https://console.upstash.com
2. Copy REST URL and token
3. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. Redis latency will appear in `GET /api/health` → `redis.latencyMs`

---

## Step 7: Post-Launch Verification

Run the launch readiness endpoint:

```bash
curl -H "Cookie: <your-admin-session-cookie>" \
  https://<your-domain>/api/admin/launch-readiness
```

Expected: `{ "overall": "ready", "summary": { "failed": 0 } }`

Then run through the QA checklist:
1. Customer signup → job creation → provider assignment → payment → review
2. Admin can view `/admin/execution`, `/admin/copilot`, `/admin/predictive-ops`
3. Stripe test charge → confirm webhook received and `payments` table updated
4. Cron manually triggered → confirm `system_events` populated

---

## Rollback

If a deployment breaks production:

```bash
# Revert to previous Vercel deployment
vercel rollback

# Or pin to a specific deployment
vercel promote <deployment-url>
```

Database migrations cannot be automatically rolled back. Keep rollback SQL scripts for any destructive migrations.

---

## Environment Variable Rotation

1. Generate new secret
2. Set in Vercel as a new value (environment variable update takes effect on next deploy)
3. Rotate Stripe webhook secret by creating a new webhook endpoint, then deleting the old one
4. CRON_SECRET rotation: update in Vercel, then trigger one cron call with the new secret to confirm

---

## Monitoring

| URL | Purpose |
|-----|---------|
| `/api/health` | System health (DB, Redis, Stripe) |
| `/api/live` | Kubernetes liveness probe |
| `/api/ready` | Kubernetes readiness probe |
| `/admin/execution` | Execution Fabric Command Center |
| `/admin/predictive-ops` | Failure predictions and anomalies |
| `/admin/copilot` | Operator Copilot |
| `/api/admin/launch-readiness` | Launch readiness check |
