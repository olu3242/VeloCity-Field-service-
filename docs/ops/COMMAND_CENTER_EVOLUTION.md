# VeloCity Command Center Evolution

## Current State

The admin command center (`src/lib/command-center/`) provides:
- `automationHealthScore()` — queue + runner health
- `marketplaceHealthScore()` — job + provider metrics
- `opsHealthScore()` — operational KPIs
- `revenueHealthScore()` — payment + payout metrics
- `executiveSummary()` — combined health snapshot
- `recommendedActions()` — top operator actions

Displayed at `/admin/command-center`.

---

## Runtime Control API (`/api/admin/runtime`)

The new operator control plane, added in this phase:

### GET /api/admin/runtime
Returns real-time runtime snapshot:
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

### POST /api/admin/runtime — Operator Actions

| Action | Effect |
|---|---|
| `pause_runtime` | Stop all queue processing (in-flight jobs complete) |
| `resume_runtime` | Restore normal processing |
| `disable_agent` | Prevent a specific agent from executing |
| `enable_agent` | Re-enable a disabled agent |
| `disable_event_type` | Stop processing a specific event type |
| `enable_event_type` | Re-enable an event type |
| `reset_circuit` | Manually close an open circuit breaker |
| `replay_event` | Re-queue a specific past event by ID |

All POST actions are audit-logged to `audit_logs`.

---

## Admin UI Command Center Extensions

### Planned Panels (Next Development Wave)

#### Runtime Health Panel
- Live queue depth chart (pending/processing/completed/failed)
- Worker throughput (events/min, avg latency)
- Circuit breaker status grid — open circuits shown as red
- AI execution rate (calls/min vs. policy limit)

#### Agent Activity Panel
- Per-agent execution count, success rate, avg latency (last 1h)
- Token usage trend (last 7 days)
- Fallback rate (% of calls using deterministic fallback)
- Recent agent errors with trace IDs

#### Operator Controls Panel
- Runtime pause/resume button (with reason required)
- Agent enable/disable toggles
- Event type enable/disable toggles
- Circuit breaker reset buttons
- Event replay input (by event ID)

#### Anomaly Alerts Panel
- Live feed of anomalies from `buildAnomalyReport()`
- Critical anomalies pinned at top
- One-click escalate / dismiss / investigate actions

#### Predictive Forecasts Panel
- SLA breach risk for today
- Demand vs. supply balance by territory
- Payout cap utilization (% of daily limit consumed)
- Churn risk summary (customers with high retention score drop)

---

## Implementation Phases

### Phase 1 (Current) — API Foundation
- ✅ `GET /api/admin/runtime` — runtime state snapshot
- ✅ `POST /api/admin/runtime` — operator controls
- ✅ Audit logging for all operator actions
- ✅ Circuit breaker + operator state accessible via API

### Phase 2 — Admin UI Integration
- Wire runtime snapshot into existing `/admin/command-center` page
- Add operator control panel with pause/resume/disable UI
- Display circuit breaker status grid

### Phase 3 — Anomaly Dashboard
- Integrate `buildAnomalyReport()` into command center
- Real-time anomaly feed with severity highlighting
- Alert notification system (dashboard badge + optional email)

### Phase 4 — Predictive Intelligence UI
- SLA forecast visualization
- Demand/supply territory heatmap
- AI effectiveness metrics (recommendation accuracy over time)
- Token cost trend charts
