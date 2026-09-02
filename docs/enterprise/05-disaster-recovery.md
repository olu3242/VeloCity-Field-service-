# Disaster Recovery & Business Continuity Guide

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21

---

## 1. Recovery Objectives

| Objective | Target | Basis |
|---|---|---|
| Recovery Time Objective (RTO) | < 5 minutes | Vercel auto-deploy from last commit on `main`; typical deploy time 2–3 minutes |
| Recovery Point Objective (RPO) | < 1 minute | Supabase continuous WAL-based backup; data loss bounded by replication lag |

These targets apply to full-stack failure (application layer). Database-only failures have a shorter RTO because Supabase manages failover independently.

---

## 2. Backup Architecture

### Database (Supabase PostgreSQL)
Supabase manages all database backups. No application-level backup process is needed for the database.

- **Continuous WAL archiving:** Write-ahead log shipped continuously; point-in-time recovery (PITR) available on Pro+ plans
- **Daily snapshots:** Automated daily logical backups retained per Supabase plan
- **Restore process:** Via Supabase dashboard (Database → Backups) or Supabase CLI

There are no application-managed dump scripts. If PITR is required, initiate from the Supabase dashboard.

### Application Code
All application code is in Git. The authoritative copy is the Git repository (GitHub). Vercel deploys from the repository automatically.

- **Recovery from code loss:** Re-clone from GitHub; no other application state outside the database
- **Environment variables:** Stored in Vercel project settings (Settings → Environment Variables). Keep a copy in a secrets manager (e.g., 1Password, Vault) as an offline backup.

### In-Memory State
The following application state is NOT backed up and is lost on process restart:

| State | Location | Recovery |
|---|---|---|
| Rate limiter counters | `rateLimitStore` in `src/middleware.ts` | Resets to zero; no action needed |
| Circuit breaker state | `circuits` Map in `src/lib/governance/circuit-breaker.ts` | All circuits reset to `closed`; may allow brief burst through previously failing paths |
| Operator pause state | `state` in `src/lib/governance/operator.ts` | `runtimePaused` resets to `false`; queue resumes automatically |

---

## 3. Rollback Procedure

### Standard Rollback (< 3 minutes)

1. Identify the last known-good commit SHA in GitHub (Actions → Deployments or `git log`)
2. In Vercel dashboard: Deployments → select the target deployment → Redeploy
3. Vercel redeploys from that commit without needing a new push
4. `src/env.ts` validates environment variables at startup — if any required variable is missing the deploy fails immediately (not silently)
5. Confirm recovery: `GET /api/health` should return `{ "status": "healthy" | "degraded" }`

### Emergency Rollback via Git

```bash
git revert HEAD --no-edit
git push origin main
```

Vercel auto-deploys on push to `main`. Total time: ~3 minutes from push to serving traffic.

### Schema Rollback

Supabase migrations are one-directional (no `down` migrations). If a migration causes issues:
1. Use Supabase PITR to restore the database to a point before the migration
2. Re-deploy the application version that matches that schema state

All migrations use `IF NOT EXISTS` guards and `ON CONFLICT DO NOTHING` inserts — they are idempotent and safe to re-run.

---

## 4. Feature Flag Kill Switches

`src/lib/feature-flags.ts` defines compile-time flags read from environment variables. Disabling a feature requires only an environment variable change and a redeploy — no code change.

| Flag | Env variable | Default | Effect if disabled |
|---|---|---|---|
| `AI_AGENTS` | `NEXT_PUBLIC_FF_AI_AGENTS=false` | ON | Agent coordinator skipped |
| `ENTERPRISE_INTELLIGENCE` | `NEXT_PUBLIC_FF_ENTERPRISE_INTEL=false` | ON | Intelligence dashboards hidden |
| `DIGITAL_TWIN` | `NEXT_PUBLIC_FF_DIGITAL_TWIN=false` | ON | Digital twin snapshot endpoint disabled |
| `KNOWLEDGE_GRAPH` | `NEXT_PUBLIC_FF_KNOWLEDGE_GRAPH=false` | ON | Knowledge graph endpoint disabled |
| `NEURAL_RUNTIME` | `NEXT_PUBLIC_FF_NEURAL_RUNTIME=true` | OFF | Neural runtime activated |

To toggle a flag without a code change: update the Vercel environment variable and trigger a redeploy from the Vercel dashboard.

---

## 5. Runtime Kill Switch

The fastest way to halt all automation processing without a deploy:

```http
POST /api/admin/runtime
Authorization: Bearer <admin_session_token>
Content-Type: application/json

{
  "action": "pause_runtime",
  "reason": "Emergency halt — investigating payment processing failure"
}
```

Effect: The `isRuntimePaused()` flag is set in `src/lib/governance/operator.ts`. The queue worker (`processAutomationQueue`) checks this flag before every run and returns immediately with `skipped = limit` when paused. Queue rows are left untouched with their current status so they resume from their exact state when unpaused.

**Important:** This state is in-memory. A Vercel function restart clears the pause. If a restart happens while paused, the queue resumes automatically. Do not rely on a runtime pause as a persistent halt across deploys.

To resume:
```http
POST /api/admin/runtime
{ "action": "resume_runtime" }
```

---

## 6. Circuit Breaker Recovery

When a circuit breaker is open, requests to that dependency are blocked and the `degraded` status is reported by the health endpoint.

**Automatic recovery:** After `resetTimeMs` (60 seconds by default), the circuit transitions to `half-open`. The next request is allowed through. If it succeeds, the circuit closes. If it fails, the circuit reopens.

**Manual reset (when root cause is resolved):**
```http
POST /api/admin/runtime
{ "action": "reset_circuit", "circuit_key": "<key from /api/health/detailed>" }
```

This calls `resetCircuit(key)` which replaces the circuit state with a fresh `closed` circuit. Use only after confirming the upstream service is healthy.

---

## 7. Dead Letter Queue

Events that fail after `MAX_RETRIES = 3` attempts are written to `automation_dead_letters` by the worker in `src/lib/automation/worker.ts`.

**Schema (migration 20260721000001):**
```sql
automation_dead_letters (
  id               uuid PRIMARY KEY,
  tenant_id        text NOT NULL,
  original_queue_id uuid,       -- links to the failed automation_queue row
  event_type       text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}',
  error_message    text,
  retry_count      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text
)
```

**Query unresolved dead letters:**
```sql
SELECT id, tenant_id, event_type, error_message, retry_count, created_at
FROM automation_dead_letters
WHERE resolved_at IS NULL
ORDER BY created_at DESC;
```

**Resolve manually (after root cause fix):**
```sql
UPDATE automation_dead_letters
SET resolved_at = now(),
    resolved_by = 'ops-<name>',
    resolution_note = 'Root cause: Stripe API timeout. Reprocessed manually after service recovery.'
WHERE id = '<dead_letter_id>';
```

**Requeue for retry:** Use the replay_event API action with the event data from the dead letter row. There is no automated requeue from the dead letter table.

---

## 8. Environment Variable Failure Mode

If a required environment variable is missing or malformed, `src/env.ts` throws at module load time:

```
ENVIRONMENT VALIDATION FAILED — startup aborted.
The following environment variables are missing or invalid:
  • STRIPE_SECRET_KEY: STRIPE_SECRET_KEY is required
```

The Vercel deployment will fail its first request (health check or otherwise) with this error. The previous deployment continues to serve traffic. This is the intended behavior — a misconfigured deploy surfaces immediately rather than silently degrading.

**Recovery:** Add the missing variable in Vercel dashboard → Settings → Environment Variables → Redeploy.

---

## 9. Migration Safety

All database migrations in `supabase/migrations/` follow these safety conventions:

- `CREATE TABLE IF NOT EXISTS` — safe to re-run
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe to re-run
- `INSERT ... ON CONFLICT DO NOTHING` — idempotent seed data
- `CREATE INDEX IF NOT EXISTS` — safe to re-run
- No `DROP TABLE`, `DROP COLUMN`, or destructive DDL without explicit migration

---

## 10. Incident Response Steps

1. **Check platform health:** `GET /api/health` — identifies healthy/degraded/unhealthy status and open circuit count
2. **Get detailed diagnosis:** `GET /api/health/detailed` — full certification report, per-circuit state, runtime pause status
3. **Check operator state and queue:** `GET /api/admin/runtime` (admin auth) — queue counts, circuit states, operator state
4. **Check Mission Control dashboard:** `/admin/mission-control` in the admin console — visual view of certification score, circuit states, and operator toggles
5. **Pause runtime if needed:** `POST /api/admin/runtime { "action": "pause_runtime" }` to halt all queue processing while investigating
6. **Inspect dead letters:** Query `automation_dead_letters WHERE resolved_at IS NULL` in Supabase dashboard for failed events
7. **Reset open circuits:** After confirming upstream service recovery, `POST /api/admin/runtime { "action": "reset_circuit", "circuit_key": "..." }`
8. **Resume runtime:** `POST /api/admin/runtime { "action": "resume_runtime" }` after confirming the issue is resolved
9. **Verify recovery:** `GET /api/health` should return `status: "healthy"` (score >= 85, zero open circuits, not paused)
10. **Document:** Update `automation_dead_letters.resolution_note` for all affected events; write incident report

---

## 11. Contact and Escalation

There is no automated alerting configured in this MVP. Integrate with your alerting platform before launch:

- **Vercel Log Drains** → route to PagerDuty, OpsGenie, or Slack
- **Supabase webhooks** → trigger on `automation_dead_letters` inserts for immediate dead-letter alerts
- **Uptime monitor** → poll `GET /api/health` every 60 seconds; alert on non-`healthy` status
