# Observability & Monitoring Guide

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21

---

## 1. Health Endpoints

These endpoints require no authentication and are safe to expose to load balancers and uptime monitors.

### GET /api/health

Lightweight summary. Use this for uptime monitoring and load balancer health checks.

**Response:**
```json
{
  "status": "healthy",
  "score": 83,
  "certified": false,
  "certificationLevel": "standard",
  "runtimePaused": false,
  "openCircuits": 0,
  "totalCircuits": 5,
  "checkedAt": "2026-07-21T12:00:00.000Z"
}
```

**Status values:**
- `healthy` — score >= 85, zero open circuits, runtime not paused
- `degraded` — score >= 70 OR any open circuit (note: score of 83 without open circuits resolves to `degraded` because 83 < 85)
- `unhealthy` — score < 70 and no open circuits offsetting the condition

**Recommended poll interval:** 60 seconds from an external uptime monitor.

### GET /api/health/detailed

Full diagnostic endpoint. Returns the complete `EnterpriseCertificationReport` and per-circuit state.

**Response:**
```json
{
  "ok": true,
  "certification": {
    "overallScore": 83,
    "certified": false,
    "certificationLevel": "standard",
    "sections": {
      "architecture": { "compliant": true, "score": 90 },
      "topology": { "valid": true, "score": 88 },
      "readiness": { "score": 75, "level": "standard" },
      "compliance": { "compliant": true, "score": 82 },
      "resilience": { "score": 80 }
    },
    "criticalIssues": [],
    "recommendations": [],
    "generatedAt": "2026-07-21T12:00:00.000Z"
  },
  "circuits": [
    { "key": "stripe-payout", "state": "closed", "failureCount": 0 },
    { "key": "anthropic-agent", "state": "closed", "failureCount": 0 }
  ],
  "runtimePaused": false,
  "checkedAt": "2026-07-21T12:00:00.000Z"
}
```

Call this endpoint when investigating a `degraded` or `unhealthy` status from the summary endpoint. The `criticalIssues` array identifies specific architecture failures. The `circuits` array shows per-circuit failure counts and state.

---

## 2. Admin Runtime Endpoint

Requires `admin` or `super_admin` role.

### GET /api/admin/runtime

Returns current queue snapshot, circuit states, and operator state.

Use this for:
- Determining how many events are pending, processing, or stuck
- Seeing which circuits are open without calling the detailed health endpoint
- Confirming whether the runtime is paused and by whom

### GET /api/admin/metrics

Returns aggregate metrics for queue throughput, job counts, agent execution, and circuit health. Requires admin auth.

### POST /api/admin/runtime

Control actions for runtime management. See `docs/enterprise/07-operational-runbook.md` for action-by-action procedures.

---

## 3. Distributed Tracing

`src/lib/observability/distributed-tracing.ts` implements an in-memory trace store.

**Functions:**
- `startTrace(traceId, name, metadata)` — begins a trace with a unique ID
- `addSpan(traceId, spanName, data)` — appends a span to an active trace
- `completeTrace(traceId, outcome)` — marks the trace complete and records duration

Traces are held in memory. There is no export to an external tracing backend (Jaeger, Zipkin, Datadog) in the current implementation. On process restart, trace history is lost.

**To add external trace export:** Instrument `completeTrace` to forward the trace object to the OpenTelemetry collector or Vercel's built-in tracing if enabled.

---

## 4. Latency Map

`src/lib/observability/latency-map.ts` records per-operation latency data in memory. Use it to identify slow operations in agent coordination and queue processing.

---

## 5. Failure Lineage

`src/lib/observability/failure-lineage.ts` tracks the causal chain of failures — i.e., which upstream failure caused a downstream effect. Useful for root-cause analysis on cascading circuit-breaker openings.

---

## 6. Structured Logging

All server-side code uses `src/lib/logger.ts` for structured JSON log output.

**Logger API:**
```typescript
import { logger, createLogger } from "@/lib/logger";

const log = createLogger({ correlationId: "abc-123", tenantId: "uuid", eventType: "job_completed" });
log.info("Processing automation event", { queueId: row.id });
log.error("Handler failed", error);
```

**Log entry shape:**
```json
{
  "level": "info",
  "message": "Processing automation event",
  "timestamp": "2026-07-21T12:00:00.000Z",
  "correlationId": "abc-123",
  "tenantId": "00000000-0000-4000-8000-000000000001",
  "eventType": "job_completed",
  "data": { "queueId": "uuid" }
}
```

**Context fields:**
- `correlationId` — request or trace ID for cross-log correlation
- `tenantId` — always present; enables per-tenant log filtering in log aggregators
- `userId` — present when a specific user action triggered the log
- `agentName` — present in agent execution logs
- `eventType` — present in automation processing logs
- `requestId` — present in API route handlers

Logs route to `stdout` (info/debug) and `stderr` (error). Vercel captures both streams. Connect Vercel Log Drains to forward to your log aggregator (Datadog, Splunk, Loki).

**Tenant fallback warnings** are always logged at `warn` level via `console.warn`:
```
[TENANT_FALLBACK] context="stripe-webhook/payment_intent.succeeded" — no tenant_id found, falling back to DEFAULT_TENANT_ID. Verify this is expected.
```

---

## 7. Database Audit Logs

Every admin action writes a row to the `audit_logs` table with:
- `tenant_id` — the tenant context
- `actor_id` — the authenticated user who performed the action
- `action` — string identifier of the action (e.g., `"job.status_changed"`, `"provider.approved"`)
- `metadata` — JSONB with action-specific details (before/after values, affected resource IDs)
- `created_at` — timestamp

RLS policy: `audit_logs` is insert-only for the service role. Admins can read but not modify. This ensures the audit trail cannot be tampered with through the application layer.

**Query audit trail for a specific job:**
```sql
SELECT actor_id, action, metadata, created_at
FROM audit_logs
WHERE metadata->>'job_id' = '<job_uuid>'
ORDER BY created_at;
```

---

## 8. Agent Execution Logs

Every agent execution writes to `agent_logs`:
- `agent_name` — which agent ran
- `job_id` — the job context (if applicable)
- `user_id` — the user context (if applicable)
- `action` — what the agent did
- `input` / `output` — JSONB payloads
- `tokens_used` — Anthropic API token count (when applicable)
- `latency_ms` — execution duration
- `error` — error message if the agent failed (null on success)
- `tenant_id` — tenant context

**Query agent errors in the last 30 days:**
```sql
SELECT agent_name, error, input, created_at
FROM agent_logs
WHERE error IS NOT NULL
  AND tenant_id = '<tenant_uuid>'
  AND created_at >= now() - interval '30 days'
ORDER BY created_at DESC;
```

---

## 9. Automation Run Logs

Every queue event processed by the worker creates a row in `automation_runs` with:
- `queue_id` — links to the `automation_queue` row
- `event_id` — links to the originating `automation_events` row
- `event_type` — which event type was processed
- `status` — `processing`, `completed`, or `failed`
- `started_at` — when processing began
- `completed_at` — when processing ended
- `actions` — what actions the handler took (JSONB)
- `output` — handler return value (JSONB)
- `error_message` — error details on failure

**Query failed automation runs:**
```sql
SELECT event_type, error_message, started_at, completed_at
FROM automation_runs
WHERE status = 'failed'
  AND tenant_id = '<tenant_uuid>'
ORDER BY started_at DESC
LIMIT 50;
```

---

## 10. Enterprise Memory

Agent coordination results are persisted to `enterprise_memory` by `storeEnterpriseMemory()`. Rows include:
- `category` — e.g., `"recommendation"`, `"risk"`, `"alert"`
- `actor_type` / `actor_id` — e.g., `"agent"` / `"coordinator"`
- `summary` — human-readable description
- `detail` — JSONB with full result data
- `tags` — array of classification tags (e.g., `["multi-agent", "coordination"]`)
- `importance` — `"normal"` or `"high"`

This provides a persistent, queryable history of all agent-generated intelligence across tenant sessions.

---

## 11. Alerting

No native alerting is configured in this MVP. Configure external alerting before launch:

| Integration | What to alert on |
|---|---|
| Vercel Log Drains → PagerDuty/OpsGenie | `"level":"error"` log entries; `[TENANT_FALLBACK]` warnings exceeding threshold |
| External uptime monitor (Pingdom, Better Uptime) | `GET /api/health` returns non-`healthy` status or non-200 HTTP code |
| Supabase webhook on `automation_dead_letters` INSERT | New unresolved dead letters (event processing failure) |
| Supabase webhook on `automation_dead_letters` count | Dead letter backlog exceeding threshold (e.g., > 10 unresolved) |

---

## 12. Admin Dashboard

The admin console at `/admin/runtime` (requires `admin` or `super_admin` role) provides a visual view of:
- Current certification score and level
- Open circuit breakers with failure counts
- Operator state (paused/running, reason, who paused)
- Queue depth by status
- Agent enable/disable controls

This dashboard is the primary operational interface for on-call engineers. It maps directly to the `GET /api/admin/runtime` and `GET /api/health/detailed` API responses.
