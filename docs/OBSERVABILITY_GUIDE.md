# Observability Guide

## Overview

VeloCity instruments every request with:
- **W3C traceparent** context propagation (zero-dependency, RFC 7230-compliant)
- **Structured JSON logging** via `src/lib/logger.ts`
- **Span recording** via `src/lib/tracing/span.ts`
- **Metrics endpoint** at `GET /api/admin/metrics`
- **Health probes** at `/api/health`, `/api/ready`, `/api/live`

## Trace Context Propagation

The middleware injects trace context on every request:

```typescript
// Incoming traceparent is propagated as a child span.
// New trace IDs are minted for requests without a parent.
const traceCtx = childContext(request.headers.get("traceparent"));
const traceparentValue = encodeTraceparent(traceCtx);
```

Every response includes:
```
traceparent: 00-{32-hex traceId}-{16-hex spanId}-01
X-Request-Id: {24-hex requestId}
X-Response-Time: {N}ms
```

### traceparent format (W3C Trace Context)

```
00-{traceId 32hex}-{spanId 16hex}-{flags 2hex}
```

- `flags = 01` → sampled (always on for production)
- `flags = 00` → not sampled

### Propagating context to downstream calls

```typescript
import { childContext, encodeTraceparent } from "@/lib/tracing";

// In an API handler:
const incomingCtx = parseTraceparent(request.headers.get("traceparent"));
const outgoingCtx = incomingCtx
  ? { ...incomingCtx, spanId: generateSpanId(), parentSpanId: incomingCtx.spanId }
  : rootContext();

const response = await fetch(downstreamUrl, {
  headers: { traceparent: encodeTraceparent(outgoingCtx) },
});
```

## Span Recording

```typescript
import { startSpan } from "@/lib/tracing";

const span = startSpan("payment.capture", {
  context: traceContext,
  attributes: { jobId, tenantId },
});
try {
  const result = await capturePayment(jobId);
  span.setAttribute("amountCents", result.amount_cents);
  span.end();
} catch (err) {
  span.setStatus("error");
  span.setAttribute("error", String(err));
  span.end();
  throw err;
}
```

Spans are emitted as structured log lines:

```json
{
  "level": "info",
  "message": "span",
  "timestamp": "2026-07-23T10:00:00.000Z",
  "traceId": "abc123...",
  "spanId": "def456...",
  "operationName": "payment.capture",
  "durationMs": 142,
  "status": "ok",
  "attributes": { "jobId": "job-1", "tenantId": "tenant-1" }
}
```

## Structured Logging

```typescript
import { createLogger } from "@/lib/logger";

const log = createLogger({ tenantId, correlationId: traceId });
log.info("payment captured", { jobId, amountCents });
log.error("stripe error", { error: err.message });
```

Log format:

```json
{
  "level": "info|warn|error|debug",
  "message": "...",
  "timestamp": "ISO8601",
  "tenantId": "...",
  "correlationId": "...",
  "data": { ... }
}
```

## Health Endpoints

### GET /api/live
Liveness probe. Always returns 200 while the process is running.

```json
{ "alive": true, "timestamp": "2026-07-23T10:00:00.000Z" }
```

### GET /api/ready
Readiness probe. Returns 200 when all critical services are configured and
the runtime is not paused. Returns 503 otherwise.

```json
{
  "ready": true,
  "checks": {
    "supabase": true,
    "stripe": true,
    "cron": true,
    "runtimeActive": true
  }
}
```

### GET /api/health
Full health report including circuit breaker state, certification score,
and subsystem status.

```json
{
  "status": "healthy|degraded|unhealthy",
  "score": 92,
  "certified": true,
  "certificationLevel": "premium",
  "runtimePaused": false,
  "openCircuits": 0,
  "totalCircuits": 3,
  "subsystems": {
    "supabase": "configured",
    "redis": "ok (12ms)",
    "stripe": "configured",
    "ai": "configured",
    "distributedRuntime": "redis"
  }
}
```

## Metrics Endpoint

```
GET /api/admin/metrics
Authorization: Requires admin role
```

Returns queue depths, agent execution counts, circuit breaker states, and
job funnel metrics.

## Log Shipping

All log output is structured JSON to stdout/stderr. Configured log shippers
(Datadog, Logtail, Papertrail) can ingest these lines directly.

Recommended fields to index:
- `traceId` — cross-service correlation
- `tenantId` — multi-tenant filtering
- `level` — severity filtering
- `operationName` — span grouping

## Alerting Recommendations

| Signal | Threshold | Action |
|--------|-----------|--------|
| `/api/health` status = `unhealthy` | Immediate | PagerDuty P1 |
| `openCircuits > 2` | 5 min | PagerDuty P2 |
| `score < 80` | 15 min | Slack alert |
| Error rate > 5% | 5 min | Slack alert |
| Redis `unreachable` | 1 min | PagerDuty P2 |
