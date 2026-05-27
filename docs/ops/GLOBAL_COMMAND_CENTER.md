# VeloCity Global Command Center

## Command Center Architecture

The Global Command Center is the operational control plane for VeloCity's AI infrastructure. It aggregates runtime health, agent execution, workflow analytics, and predictive intelligence into a unified operator interface.

```
Admin hits /admin/command-center
        ↓
Client calls GET /api/admin/runtime (runtime snapshot)
             GET /api/automation/health (queue + execution health)
             GET /api/admin/command-center (existing health scores)
        ↓
Aggregated view: Runtime | Agents | Queue | Anomalies | Circuits
```

---

## Current APIs

### Runtime Control Plane (`GET/POST /api/admin/runtime`)

**GET response:**
```json
{
  "operator_state": {
    "runtimePaused": false,
    "disabledAgents": [],
    "disabledEventTypes": []
  },
  "circuits": [
    { "key": "IVY:dispute_opened", "state": "closed", "failureCount": 0 }
  ],
  "queue": { "pending": 3, "processing": 1, "completed": 892, "failed": 0 },
  "recent_runs": [...],
  "recent_errors": []
}
```

**POST actions:**
| Action | Description |
|---|---|
| `pause_runtime` | Global halt (in-flight jobs complete) |
| `resume_runtime` | Restore processing |
| `disable_agent` | Stop a specific agent |
| `enable_agent` | Re-enable agent |
| `disable_event_type` | Stop processing event type |
| `enable_event_type` | Re-enable event type |
| `reset_circuit` | Manually close open circuit |
| `replay_event` | Re-queue past event by ID |

---

## Health Score Dashboard (Existing)

`src/lib/command-center/` provides:
- `automationHealthScore()` — queue + run success rates
- `marketplaceHealthScore()` — job + provider metrics
- `opsHealthScore()` — operational KPIs
- `revenueHealthScore()` — payment + payout metrics
- `executiveSummary()` — combined health snapshot

---

## Planned Panels (Phase 2)

### AI Execution Panel
- Per-agent: execution count, success rate, avg latency, token usage (last 1h)
- Fallback rate (% of calls using deterministic fallback)
- Recent errors with trace IDs linking to agent_logs

### Circuit Breaker Grid
- All circuits displayed as colored status indicators
- Red = open, yellow = half-open, green = closed
- Click to reset, view failure history

### Workflow Analytics Panel
- Active workflow executions (status, step, age)
- Pending human approvals (type, requester, expiry)
- Workflow completion rates by template
- Average workflow duration by template

### Anomaly Intelligence Feed
- Live feed from `buildAnomalyReport()` and `buildIntelligenceReport()`
- Critical anomalies pinned with recommended actions
- One-click escalate / dismiss / investigate

### Intelligence Mesh Panel
- Top operational patterns (confidence, frequency)
- Recent execution memories (domain, outcome)
- Learning signals with workflow optimization recommendations

### Tenant Health Grid
- Per-tenant: queue depth, SLA compliance, AI call quota usage
- Tier indicator (standard / premium / enterprise)
- Budget utilization (daily token spend vs. budget)

### Predictive Forecasts Panel
- SLA breach risk (next 2 hours)
- Queue congestion forecast (next 30 min)
- Payout cap utilization (% of daily limit)
- Provider supply gap by territory

---

## Implementation Roadmap

| Phase | Panel | Status |
|---|---|---|
| 1 (done) | Runtime control API | ✅ Complete |
| 1 (done) | Health score cards | ✅ Complete |
| 2 | Agent activity + circuit grid | Planned |
| 2 | Workflow analytics + pending approvals | Planned |
| 3 | Anomaly intelligence feed | Planned |
| 3 | Intelligence mesh panel | Planned |
| 4 | Tenant health grid + SLA monitoring | Planned |
| 4 | Predictive forecasts | Planned |
