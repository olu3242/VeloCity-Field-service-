# VeloCity Predictive Operations

## Overview

VeloCity's predictive layer converts operational data into forward-looking signals. These signals feed autonomous escalations, admin alerts, and proactive interventions — all under human governance.

---

## Scoring Engine

All scoring modules live in `src/lib/scoring/`.

### Individual Scores

| Module | Input | Output | Use |
|---|---|---|---|
| `providerTrustScore` | completedJobs, avgRating, disputeRate, responseRate, noShowRate | 0–100 trust score | Provider quality gating |
| `customerTrustScore` | jobCount, paymentHistory, disputeRate, reviewCount | 0–100 trust score | Customer risk assessment |
| `disputeRiskScore` | jobRisk, quoteFairness, providerTrust, hasChangeOrder | 0–100 risk score | Pre-dispute escalation |
| `paymentRiskScore` | amountCents, failedPayments, hasDispute, customerTrust | 0–100 risk score | Payout hold decisions |
| `jobRiskScore` | category, daysOverdue, changeOrder, providerTrust | 0–100 risk score | SLA and workflow monitoring |
| `retentionScore` | completedJobs, avgRating, disputeRate | 0–100 retention score | Churn prediction |
| `quoteFairnessScore` | lineItems, category, laborHours, partsRatio | 0–100 fairness score | Quote anomaly detection |
| `dispatchConfidenceScore` | providerDistance, availability, trustScore, categoryMatch | 0–100 confidence | Dispatch optimization |
| `territoryHealthScore` | demand, supply, avgRevenue, disputeRate | 0–100 health score | Expansion decision-making |
| `franchiseReadinessScore` | territoryHealth, volumeTrend, providerPipeline | 0–100 readiness | Franchise opportunity flagging |

### Composite Scores (`src/lib/scoring/composite/operationalScoring.ts`)

- `buildJobRiskProfile()` — aggregates dispute + payment + job risk into composite score + flags + escalate boolean
- `buildProviderHealthProfile()` — aggregates trust + retention into overall health + suspend recommendation
- `buildOperationalPulse()` — queue pressure + dispute load + payout backlog → platform health signal

---

## Anomaly Detection (`src/lib/prediction/anomalyDetection.ts`)

### Queue Anomalies
| Anomaly | Threshold | Severity |
|---|---|---|
| Queue flood | >200 pending items | critical |
| Queue pressure | >50 pending items | high |
| Failed items | >20 permanently failed | critical |
| Stale pending | >15 minutes oldest item | high |

### Payment Anomalies
| Anomaly | Threshold | Severity |
|---|---|---|
| Failed payments | >10 in 24h | critical |
| Chargeback spike | >5 in 7 days | critical |
| Payout backlog | >$500K pending | high |
| High refund rate | >8% in 30 days | high |

### Provider Anomalies
| Anomaly | Threshold | Severity |
|---|---|---|
| No-show rate | >5% in 30 days | high |
| Dispute rate | >12% in 30 days | high |
| Offer rejection spike | >30% of active providers | medium |

---

## Forecasting (`src/lib/prediction/`)

| Module | Forecasts |
|---|---|
| `demandForecast` | Service category demand by territory, rolling 7/30/90 day |
| `providerSupplyForecast` | Provider capacity gaps by category and region |
| `slaForecast` | SLA breach probability from open job load vs. provider capacity |
| `categoryDemandTrends` | Seasonal demand patterns by service category |

---

## Autonomous Escalation Triggers

These signals automatically route to the appropriate agent or admin queue:

| Signal | Source | Autonomous Action | Human Required? |
|---|---|---|---|
| Dispute risk critical | `buildJobRiskProfile()` | Route to IVY immediately | No (IVY recommendation only) |
| Fraud detected | GABRIEL + paymentRiskScore | Block + notify admin | Yes (admin must review) |
| Provider suspend recommended | `buildProviderHealthProfile()` | Flag for review, notify admin | Yes (always) |
| Payout anomaly | `detectPaymentAnomalies()` | Hold payout, notify FINN | No (hold is automatic) |
| Queue critical | `detectQueueAnomalies()` | Alert operations team | Depends on cause |
| SLA breach predicted | `slaForecast()` | Trigger `sla_warn` event | No (auto-escalate) |
| Churn risk high | `retentionScore` via LENA | Schedule retention campaign | No |

All autonomous actions are logged to `agent_logs` and `audit_logs`. Operators can override any recommendation via `/api/admin/runtime`.

---

## Predictive Alerts (Roadmap)

| Alert | Trigger | Channel | Priority |
|---|---|---|---|
| Queue congestion predicted | Pending items growing >20% in 10 min | Admin dashboard | P1 |
| Payout day cap approaching | >80% of daily cap consumed | Email + dashboard | P1 |
| High dispute cluster | >3 disputes from same provider in 48h | Admin dashboard | P1 |
| Provider churn risk | Trust score drops >20 points in 7 days | Dashboard | P2 |
| Territory demand spike | Demand forecast >2σ above baseline | TESS alert | P2 |
| Seasonal demand shift | Category demand trending ±15% week-on-week | Weekly report | P3 |
