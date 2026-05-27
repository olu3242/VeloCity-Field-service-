# VeloCity Global Execution Telemetry

## Overview

The telemetry system (`src/lib/economy/telemetry.ts`) provides a rolling global view of platform execution health — tracking event throughput, AI effectiveness, workflow performance, and operational reliability.

---

## Telemetry Snapshot

`takeSnapshot()` captures a point-in-time view and resets counters:

```typescript
{
  timestamp: "2025-05-26T14:30:00Z",
  windowMs: 60000,              // 1-minute snapshot window
  eventsProcessed: 847,
  eventsQueued: 12,
  eventsFailed: 3,
  aiCallsTotal: 234,
  aiCallsSucceeded: 231,
  aiCallsFailed: 3,
  avgLatencyMs: 1842,
  totalCostUsd: 2.11,
  anomaliesDetected: 2,
  escalationsTriggered: 1,
  workflowsCompleted: 18,
  workflowsFailed: 0,
}
```

Snapshots are stored in a rolling buffer (last 100). Useful for trend analysis.

---

## Recording Events

Telemetry is recorded at key execution points:

```typescript
// In automation worker:
recordEvent(true);                        // event processed successfully
recordEvent(false);                       // event failed

// In dispatchAgent():
recordAICall(true, 1842, 0.0166);         // success, latency, cost
recordAICall(false, 500, 0);              // failure

// In anomaly detection:
recordAnomaly();

// In escalation handler:
recordEscalation();

// In workflow engine:
recordWorkflow(true);                     // completed
recordWorkflow(false);                    // failed
```

---

## Effectiveness Scores

`calculateEffectiveness()` aggregates recent snapshots into four scores (0-100):

| Score | Formula | Good Range |
|---|---|---|
| Automation Effectiveness | `(1 - failedEvents/processedEvents) × 100` | > 95 |
| AI Effectiveness | `(aiSucceeded/aiTotal) × 100` | > 90 |
| Queue Health | `100 - min(100, queuedRatio × 50)` | > 85 |
| Operational Reliability | `(workflowsCompleted/totalWorkflows) × 100` | > 92 |
| **Composite** | Average of all four | > 90 |

---

## Business Intelligence

`getBusinessIntelligence()` derives operational ROI and recommendations:

```typescript
{
  automationROI: "847 events auto-processed → ~212 hours of manual work avoided",
  topIssues: [
    "Queue failures require attention (3 failed in window)",
    "AI reliability below threshold (1.3% failure rate)"
  ],
  recommendations: [
    "Investigate failed queue items in automation_queue",
    "Check Anthropic API status — failure rate elevated"
  ]
}
```

ROI calculation: 0.25 hours saved per auto-processed event (15 minutes of manual handling avoided).

---

## Telemetry Dashboard Integration

The telemetry system feeds the Global Command Center with:

| Metric | Display |
|---|---|
| Events/minute | Real-time throughput chart |
| AI calls/hour vs. quota | Gauge per tenant |
| Effectiveness composite | Health score card |
| Cost trends | 7-day rolling cost chart |
| Anomaly frequency | Alert feed |
| Workflow completion rate | Success percentage |

---

## Global Metrics vs. Tenant Metrics

**Global** (`getCostReport()` with no tenantId):
- Total platform cost, calls, tokens
- Useful for infrastructure cost management

**Per-tenant** (`getCostReport(tenantId)`):
- Individual tenant consumption
- SLA compliance metrics
- Budget utilization

---

## Alerting Thresholds (Recommended)

| Metric | Alert Threshold | Severity |
|---|---|---|
| Automation effectiveness | < 90% | High |
| AI effectiveness | < 85% | High |
| Queue health | < 70% | Critical |
| Composite effectiveness | < 80% | High |
| Failed events in window | > 20 | Critical |
| AI calls failed | > 5% of total | Medium |
| Cost per hour | > $10 | Medium |

---

## Snapshot Retention

In-memory buffer: last 100 snapshots.

For production telemetry persistence:
- Write snapshots to `execution_telemetry` Supabase table every minute
- Retain 90 days of per-minute snapshots
- Aggregate to hourly for 1-year retention
- Daily summaries retained indefinitely
