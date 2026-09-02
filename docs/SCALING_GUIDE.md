# Horizontal Scaling Guide

## Architecture Model

VeloCity is designed as a **stateless Next.js application** backed by:
- Supabase Postgres (primary state store)
- Redis / Upstash (distributed runtime state)
- Stripe (payment state)

All per-request state lives in the database or Redis. No in-process state
is required for correct operation. Multiple instances can serve requests
simultaneously.

## Probe Endpoints

### Liveness: `GET /api/live`
Returns 200 while the process is alive. Use this for Kubernetes `livenessProbe`.
Never returns 5xx (if it did, the process would be restarted).

### Readiness: `GET /api/ready`
Returns 200 when:
- `NEXT_PUBLIC_SUPABASE_URL` is configured
- `STRIPE_SECRET_KEY` is configured
- `CRON_SECRET` is configured
- Runtime is not paused by operator

Returns 503 otherwise. Use this for Kubernetes `readinessProbe` to prevent
traffic being routed to warming-up instances.

### Health: `GET /api/health`
Returns the full system health report including Redis latency, circuit
breaker state, and enterprise certification score.

## Kubernetes Manifest Snippets

```yaml
livenessProbe:
  httpGet:
    path: /api/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /api/live
    port: 3000
  failureThreshold: 30
  periodSeconds: 5
```

## Multiple Web Instances

**Rate limiting**: Distributed sliding-window per tenant/IP using Redis sorted
sets. When Redis is provisioned, all instances share the same window. Without
Redis, each instance applies an independent in-memory window (additive effect —
more instances = more total capacity, so per-instance limits are more lenient
than intended).

**Circuit breakers**: In-memory per instance by default. When Redis is
provisioned, circuit state is replicated across instances via Redis hashes.
A single service failure opens the circuit on whichever instance observed it;
other instances learn on their next request.

**Session state**: Managed by Supabase auth (JWT cookies). Stateless — any
instance can verify any session.

## Multiple Workers

The automation queue worker (`src/lib/automation/worker.ts`) uses:
- `SELECT ... FOR UPDATE SKIP LOCKED` for PostgreSQL-level leader election
- Processing timeout cleanup (rows stuck in `processing` for >10min are reset)
- Event idempotency via `dedup_key` column

Multiple worker instances can run concurrently. Each instance independently
polls and claims rows with `FOR UPDATE SKIP LOCKED`, ensuring exactly-once
processing without a distributed lock.

To run N workers: deploy N replicas of the worker process. No coordination
needed beyond Postgres row locking.

## Multiple Cron Runners

Cron routes are HTTP endpoints protected by `CRON_SECRET`. They are designed
to be idempotent — running the same cron job twice in the same window is safe:
- All queries filter by `status` so already-processed rows are skipped
- `emitEvent` uses `dedup_key` to prevent duplicate events

To prevent duplicate cron firing across instances, configure your cron
scheduler (Vercel Cron, GitHub Actions, ECS Scheduled Tasks) to invoke the
endpoint once per schedule. The endpoint itself is idempotent regardless.

## Rolling Deployments

Next.js supports **zero-downtime rolling deployments** when:
1. API contracts are backward-compatible (all new routes add, not change)
2. Database migrations are backward-compatible (additive columns, no renames)
3. Redis keys use versioned namespaces for major format changes

Current deployment model (Vercel):
- Blue/green deployments via preview → production promotion
- Old instances serve traffic until the new deployment is live
- No state migration needed (Postgres and Redis state are backward-compatible)

## Graceful Shutdown

Next.js handles SIGTERM by completing in-flight requests before exiting.
The worker process should:
1. Stop accepting new queue rows on SIGTERM
2. Finish processing the current row
3. Exit cleanly

Implement in `worker.ts`:
```typescript
let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; });

// In the main loop:
if (shuttingDown) break;
```

## Connection Draining

Load balancers should be configured with a **connection drain timeout** of
at least 30 seconds to allow in-flight Stripe webhook processing and
AI agent calls (which can take up to 60 seconds) to complete.

## Scaling Limits

| Component | Current limit | Scale-out path |
|-----------|--------------|----------------|
| Web instances | Unlimited (stateless) | Horizontal |
| Workers | Unlimited (row-lock dedup) | Horizontal |
| Supabase connections | 60 (default pool) | PgBouncer / connection pooler |
| Redis connections | N/A (HTTP REST API, stateless) | No limit |
| AI agent concurrency | Controlled by `DEFAULT_QUOTAS.hourlyEventLimit` | Raise quota |
