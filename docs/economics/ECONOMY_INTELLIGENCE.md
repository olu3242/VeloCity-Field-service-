# VeloCity Economy Intelligence

## Overview

Economy intelligence aggregates ROI scoring, cost analytics, and business health into a unified operational view. It connects the economics layer (`src/lib/economics/`) with the telemetry system (`src/lib/economy/telemetry.ts`) to provide actionable financial intelligence.

---

## Intelligence Stack

```
Telemetry snapshots (rolling 100)
    ↓
calculateEffectiveness() → 4 scores + composite
    ↓
analyzeQueueCosts() + analyzeDisputeCosts()
    ↓
calculateROI() → AutomationROIMetrics
    ↓
scoreTenantHealth() → letter grade + recommendations
    ↓
buildExecutiveMetrics() → board summary
```

---

## Key Intelligence Outputs

### 1. Tenant Health Grade

Computed from 5 operational dimensions (automation, payment, SLA, disputes, retention). Updated on each telemetry snapshot. Grades A–F trigger different SLA monitoring levels.

### 2. ROI Multiplier

Ratio of labor cost avoided to AI execution cost. A multiplier of 100× means every $1 in AI spend avoids $100 in manual labor.

**Target:** > 200× for mature automation deployments.

### 3. Cost Efficiency Grade

Derived from `avgCostPerCall`, AI failure rate, and queue retry overhead. Grades drive infrastructure recommendations.

---

## Business Intelligence Triggers

| Condition | Intelligence Action |
|---|---|
| ROI multiplier < 50× | Alert: automation scope too narrow |
| Tenant grade drops from A→C | Alert: operational degradation |
| Queue retry overhead > 15% | Recommendation: increase timeout bounds |
| Dispute cost > $1,000/window | Alert: dispute prevention priority |
| Provider network health < 60 | Alert: churn intervention required |

---

## Integration with Global Telemetry

```typescript
// Economy intelligence reads from telemetry:
const snapshot = takeSnapshot();
const roi = calculateROI({
  eventsAuto: snapshot.eventsProcessed - snapshot.eventsFailed,
  eventsTotal: snapshot.eventsProcessed,
  aiCostUsd: snapshot.totalCostUsd,
  periodLabel: snapshot.timestamp,
});

const health = scoreTenantHealth({
  automationRate: roi.automationRate,
  paymentFailureRate: snapshot.eventsFailed / snapshot.eventsProcessed,
  slaBreachRate: 0,
  disputeRate: snapshot.anomaliesDetected / snapshot.eventsProcessed,
  providerRetentionRate: 0.92,
});
```

---

## Alerting Integration

Economy intelligence outputs feed the Global Command Center:

| Metric | Dashboard Panel |
|---|---|
| ROI multiplier | Executive summary card |
| Tenant health grade | Tenant status grid |
| Cost by agent | Agent cost breakdown chart |
| Net ROI trend | 7-day ROI chart |
| Provider network health | Operations health gauge |
