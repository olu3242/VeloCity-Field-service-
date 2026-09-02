# Operational Runbook

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Audience:** On-call engineers and platform operators

All API calls in this runbook require an active admin or super_admin session unless otherwise noted. Use a browser session from `/admin` or an HTTP client with a valid Supabase session cookie.

---

## Daily Operations Checklist

Run these checks at the start of each business day:

1. **Platform health:** `GET /api/health`
   - Expected: `{ "status": "healthy" }` (score >= 85, zero open circuits, not paused)
   - If `degraded`: call `GET /api/health/detailed` to identify root cause
   - If `unhealthy`: escalate immediately (score < 70)

2. **Admin runtime overview:** Navigate to `/admin/runtime` or `GET /api/admin/runtime`
   - Review certification score trend
   - Confirm zero open circuit breakers
   - Confirm runtime is not paused

3. **Dead letter queue:** In Supabase dashboard, run:
   ```sql
   SELECT count(*) FROM automation_dead_letters WHERE resolved_at IS NULL;
   ```
   Any non-zero count requires investigation before end of day.

4. **Agent error rate:** In Supabase dashboard:
   ```sql
   SELECT agent_name, count(*) as errors
   FROM agent_logs
   WHERE error IS NOT NULL AND created_at >= now() - interval '24 hours'
   GROUP BY agent_name ORDER BY errors DESC;
   ```

---

## Handling a Stuck Queue

A stuck queue occurs when events remain in `status = "processing"` for more than 10 minutes without completing.

**Step 1:** Check queue state
```http
GET /api/admin/runtime
```
Look for events with `status = "processing"` that have been running longer than expected.

**Step 2:** Query the database directly
```sql
SELECT id, event_type, status, created_at, error_message
FROM automation_queue
WHERE status = 'processing'
  AND created_at < now() - interval '10 minutes'
ORDER BY created_at;
```

**Step 3:** Determine if the worker is deadlocked or the event is genuinely long-running
- If the worker crashed mid-processing, rows remain in `processing` state indefinitely
- The next worker run does NOT automatically pick up `processing` rows (only `pending` and `failed` are polled)
- Manual reset required: update the stuck row back to `pending`

**Step 4:** Reset stuck rows
```sql
UPDATE automation_queue
SET status = 'pending',
    error_message = 'Reset from processing by ops after timeout',
    available_at = now()
WHERE status = 'processing'
  AND created_at < now() - interval '10 minutes';
```

**Step 5:** Verify the next worker run picks up the events. Queue worker runs on the cron schedule. Force an immediate run if needed via the cron trigger endpoint (requires CRON_SECRET).

**Step 6:** If the event type is consistently getting stuck, consider disabling that event type:
```http
POST /api/admin/runtime
{ "action": "disable_event_type", "event_type": "problematic_event_type" }
```

---

## Handling an Open Circuit Breaker

An open circuit breaker blocks requests to a failing dependency and prevents cascading failures.

**Step 1:** Identify which circuits are open
```http
GET /api/health/detailed
```
Check the `circuits` array for entries with `"state": "open"`.

**Step 2:** Investigate the root cause
- `failureCount` on the circuit tells you how many consecutive failures triggered it
- Check Supabase logs for errors from the relevant service
- Check external service status pages (Stripe status, Anthropic status)
- Search agent_logs for recent errors:
  ```sql
  SELECT error, created_at FROM agent_logs
  WHERE error IS NOT NULL
  ORDER BY created_at DESC LIMIT 20;
  ```

**Step 3:** Wait for automatic half-open recovery (60 seconds after `openedAt`) and monitor whether the circuit self-heals.

**Step 4:** If root cause is confirmed resolved and you want to force recovery immediately:
```http
POST /api/admin/runtime
{
  "action": "reset_circuit",
  "circuit_key": "<key from /api/health/detailed circuits array>"
}
```
This calls `resetCircuit(key)` which replaces the circuit with a fresh `closed` state. Use only after confirming the upstream service is healthy.

**Step 5:** Monitor the circuit for re-opening after reset. If it re-opens immediately, the root cause is not resolved.

---

## Pausing the Runtime

Use this when you need to halt all automation queue processing immediately — for example, when deploying a hotfix that changes event handler behavior and you need to prevent events from being processed with the old code.

**Pause:**
```http
POST /api/admin/runtime
{
  "action": "pause_runtime",
  "reason": "Deploying emergency patch for payment handler bug — ETA 15 min"
}
```

Effect:
- `isRuntimePaused()` returns `true`
- All calls to `processAutomationQueue()` return immediately with `skipped = limit`
- Queue rows are left untouched — no data is lost
- The health endpoint reports `runtimePaused: true`

**Verify pause is active:**
```http
GET /api/health
```
Expected: `"runtimePaused": true`

**Resume after patch is deployed and verified:**
```http
POST /api/admin/runtime
{ "action": "resume_runtime" }
```

**Important limitation:** Pause state is in-memory. A Vercel function restart clears the pause. If the function restarts while paused, the queue resumes automatically. Plan deployments accordingly.

---

## Disabling an AI Agent

Use this when a specific agent is producing incorrect outputs, consuming excessive tokens, or causing downstream issues.

**Disable:**
```http
POST /api/admin/runtime
{
  "action": "disable_agent",
  "agent_name": "finance-agent"
}
```

Agent names match the `SpecialistAgentType` values in `src/lib/agents/coordinator.ts`:
`executive-advisor`, `customer-success`, `finance-agent`, `risk-analyst`, `compliance-agent`, `provider-coach`, `growth-strategist`, `dispatch-agent`, `franchise-advisor`, `commercial-advisor`

Effect:
- `isAgentEnabled("finance-agent")` returns `false`
- The coordinator skips this agent in all subsequent `coordinateAgents()` calls
- Other agents continue to run normally
- The `CoordinationResult` will have one fewer analysis in its `analyses` array

**Re-enable:**
```http
POST /api/admin/runtime
{
  "action": "enable_agent",
  "agent_name": "finance-agent"
}
```

**Important limitation:** Agent enable/disable state is in-memory and resets on process restart.

---

## Deploying a New Version

Standard deployment flow:

1. Merge changes to `main` branch
2. Vercel auto-deploys on push to `main` (preview deploys on feature branches)
3. `src/env.ts` validates all required environment variables at startup
   - If any required variable is missing, the deploy fails on first request with a structured error
   - The previous deployment continues serving traffic
4. Monitor Vercel deployment logs for startup errors
5. After deploy completes, verify:
   ```http
   GET /api/health
   ```
   Should return `status: "healthy"` or `status: "degraded"` (not `"unhealthy"`)
6. If the deployment is unhealthy, initiate rollback (see Disaster Recovery guide)

---

## Adding Environment Variables

When a new integration or configuration value is needed:

1. Add to Vercel dashboard: Project Settings → Environment Variables
   - Set for Production, Preview, and Development environments as appropriate
2. Add the variable to `src/env.ts` Zod schema:
   - Required variable (hard failure if missing): add to `serverSchema` with `.min(1, "message")`
   - Optional variable (graceful degradation): add with `.optional()`
3. Update `.env.local.example` with the variable name and a placeholder value
4. Redeploy to pick up the new variable (Vercel redeploys don't inherit new env vars until redeployed)
5. Verify startup: check Vercel function logs for the `ENVIRONMENT VALIDATION FAILED` error — absence confirms the variable was picked up

---

## Managing Dead Letter Events

Dead letters accumulate when events fail `MAX_RETRIES = 3` times. They require manual investigation and resolution.

**View unresolved dead letters:**
```sql
SELECT id, tenant_id, event_type, error_message, retry_count, created_at
FROM automation_dead_letters
WHERE resolved_at IS NULL
ORDER BY created_at DESC;
```

**Investigate the failure:**
1. Check `error_message` — this is the last error from the handler
2. Look up the original queue row: `SELECT * FROM automation_queue WHERE id = '<original_queue_id>'`
3. Check `automation_runs` for all attempts: `SELECT * FROM automation_runs WHERE queue_id = '<original_queue_id>'`
4. Determine if the failure was transient (service outage) or permanent (bad data, code bug)

**Requeue a recoverable event:**
```http
POST /api/admin/runtime
{
  "action": "replay_event",
  "event_id": "<event_id from the dead_letter row's payload or original queue row>"
}
```
This re-inserts the event into `automation_queue` with `status = "pending"`.

**Mark as resolved without requeueing:**
```sql
UPDATE automation_dead_letters
SET resolved_at = now(),
    resolved_by = 'ops-<engineer-name>',
    resolution_note = 'Transient Stripe timeout during service outage. Job has since been manually verified complete.'
WHERE id = '<dead_letter_id>';
```

---

## Checking Notification Delivery

Twilio (SMS) and SendGrid (email) are optional integrations. If `TWILIO_*` or `SENDGRID_API_KEY` are absent, notifications are silently skipped.

**Check if Twilio is configured:**
The `isFeatureConfigured("twilio")` function in `src/env.ts` returns true only if all three Twilio variables are present: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.

**Verify end-to-end notification delivery (before launch):**
1. Trigger a job status change that fires a notification event (e.g., `job_accepted`)
2. Check Twilio dashboard for sent SMS
3. Check SendGrid activity feed for sent email
4. If absent, check Vercel function logs for `[TENANT_FALLBACK]` or notification-related errors

---

## Handling a Failed Stripe Webhook

Stripe retries failed webhook deliveries for up to 72 hours with exponential backoff.

**Symptoms:** Payment or subscription state not updating in the platform despite Stripe showing the event as delivered.

**Investigation:**
1. Check Stripe dashboard → Developers → Webhooks → `<your endpoint>` → Recent deliveries
2. Find the failed delivery and inspect the HTTP response status and body
3. If the platform returned 400 (signature verification failed): check that `STRIPE_WEBHOOK_SECRET` matches the signing secret shown in Stripe webhook settings
4. If the platform returned 500: check Vercel function logs for the error around the webhook delivery timestamp
5. Common root cause: raw body was modified before signature verification (do not call `request.json()` before `stripe.webhooks.constructWebhookEvent`)

**Force re-delivery:**
In Stripe dashboard → webhook delivery → Resend. This re-queues the event for delivery.

---

## Querying the Audit Log

All admin actions are recorded in `audit_logs`. Use for compliance review and incident reconstruction.

**All actions by a specific admin in the last 7 days:**
```sql
SELECT action, metadata, created_at
FROM audit_logs
WHERE actor_id = '<admin_user_uuid>'
  AND created_at >= now() - interval '7 days'
ORDER BY created_at DESC;
```

**All actions on a specific job:**
```sql
SELECT actor_id, action, metadata, created_at
FROM audit_logs
WHERE metadata->>'job_id' = '<job_uuid>'
ORDER BY created_at;
```
