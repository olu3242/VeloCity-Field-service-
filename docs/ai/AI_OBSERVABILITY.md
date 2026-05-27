# VeloCity AI Observability

## What Is Tracked

Every AI agent execution produces an `agent_logs` record with:

| Field | Description |
|---|---|
| `agent_name` | ALICE / MAX / IVY / etc. |
| `tenant_id` | Multi-tenant isolation |
| `job_id` | Associated job |
| `action` | Human-readable role description |
| `input` | Prompt sent to the agent |
| `output` | Parsed agent response |
| `tokens_used` | Anthropic input + output tokens |
| `latency_ms` | Wall-clock execution time |
| `error` | Error message if run failed |
| `trace_id` | Cross-hop trace ID (propagated from dispatcher) |

GABRIEL inserts a second record to `agent_logs` with `action = "Governance Audit"` for every event processed, regardless of which handler ran.

---

## Execution Tracing

```
POST /api/automation/process
  → routeAutomationEvent()
    → handler (e.g. handleIvyDispute)
      → dispatchAgent("IVY", prompt, context)
        → createTrace("IVY", tenantId, jobId)
        → hydrateContext("IVY", baseContext)
        → runAgent("IVY", { prompt, ...context })
          → BaseAgent.run() → Anthropic API
          → BaseAgent.log() → agent_logs (trace_id attached)
        → recordTrace() → agent_logs (execution summary)
```

Trace IDs follow the format: `trace-{agentName}-{timestamp}-{random}`.

---

## Token Usage Monitoring

Token usage is recorded per agent execution. Use this query to monitor costs:

```sql
SELECT
  agent_name,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS executions,
  SUM(tokens_used) AS total_tokens,
  AVG(tokens_used) AS avg_tokens,
  AVG(latency_ms) AS avg_latency_ms,
  COUNT(*) FILTER (WHERE error IS NOT NULL) AS failures
FROM agent_logs
WHERE tenant_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY agent_name, day
ORDER BY day DESC, total_tokens DESC;
```

---

## Failure Tracking

Failed agent runs (where `error IS NOT NULL`) are written to `agent_logs` with full error detail. They are additionally written to `audit_logs` with action `handler_error:{event_type}` via the router's catch block.

Alert triggers (recommended):
- Any single agent: >10% failure rate over 1 hour → PagerDuty/Slack alert
- IVY failure: any failure on `dispute_opened` → immediate escalation
- FINN failure on `payment_captured` → requires manual reconciliation review

---

## Recommendation Telemetry

IVY, REX, QUINN, and TESS produce structured recommendations in their output JSON. These feed:

| Agent | Output field | Downstream consumer |
|---|---|---|
| IVY | `recommendation` + `confidence` | Admin dispute detail page |
| REX | `trust_score_delta` + `flag` | Provider trust score |
| QUINN | `flagged` + `adjustment_percent` | Quote approval flow |
| TESS | `growth_signal` + `recommendations` | Territory dashboard |

Recommendation outcomes (approved vs. overridden by operators) should be tracked for AI effectiveness measurement. Current status: logged in `agent_logs.output`, manual analysis required. Automated outcome tracking is a Wave 5 improvement.

---

## Operator Override Audit

When an operator overrides an AI recommendation (e.g., manually resolves a dispute differently than IVY recommended), this should be recorded via:

```
POST /api/admin/runtime
{ action: "operator_override", agent: "IVY", entity_id: "<dispute_id>", reason: "..." }
```

This writes to `audit_logs` with `action: "operator:operator_override"`.

---

## Admin Visibility

The admin runtime command center (`GET /api/admin/runtime`) exposes:
- Current operator state (paused/active, disabled agents)
- Circuit breaker states (open/closed/half-open per agent)
- Queue snapshot (pending/processing/completed/failed)
- Recent runs (last 5 completed runs)
- Recent errors (last 10 failed queue items)

Access: admin role required, all requests audit-logged.

---

## Observability Roadmap

| Priority | Enhancement |
|---|---|
| P1 | Anthropic cost per execution (`cost_usd` column on `agent_logs`) |
| P1 | Real-time circuit breaker dashboard in admin UI |
| P2 | Recommendation outcome tracking (approved vs. overridden) |
| P2 | Per-agent latency P50/P95/P99 charts |
| P3 | Distributed tracing across handler chains |
| P3 | AI effectiveness score (recommendation accuracy over time) |
