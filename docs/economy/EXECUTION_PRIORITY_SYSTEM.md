# VeloCity Execution Priority System

## Overview

The priority system ensures that critical operational events (disputes, fraud, SLA breaches) are processed before lower-priority events (territory analysis, retention campaigns), and that enterprise tenants receive guaranteed execution quality.

---

## Two-Layer Priority

### Layer 1: Event Priority (`federation/prioritization.ts`)

Queue-level prioritization based on event type, SLA urgency, and retry count:

| Priority | Score | Event Types |
|---|---|---|
| Critical | 85-100 | `dispute_opened`, `chargeback_opened`, `sla_breach`, `sla_escalate` |
| High | 65-84 | `payment_failed`, `payout_failed`, `job_completed`, `provider_offer_sent` |
| Medium | 35-64 | Most job lifecycle events |
| Low | 0-34 | `tip_submitted`, `review_requested`, `daily_territory_analysis` |

Boosts applied on top of base score:
- SLA breach within 30 min: **+20**
- Emergency urgency: **+15**, Same-day: **+8**
- Retry count: **+10 per retry** (max +30)

### Layer 2: Tenant Tier Priority (`orchestration/routing-engine.ts`)

Tier-based execution guarantees:

| Tier | Queue Wait | Priority Boost | Dedicated Worker | AI Quota |
|---|---|---|---|---|
| Standard | 30s max | +0 | No | 50 calls/hr |
| Premium | 5s max | +15 | No | 200 calls/hr |
| Enterprise | 1s max | +30 | Yes | 1,000 calls/hr |

```typescript
const decision = routeWorkload("dispute_opened", tenantId, 90);
// Enterprise tenant:
// { routingStrategy: "priority_lane", estimatedDelayMs: 0, priority: 120 (capped at 100) }

// Standard tenant:
// { routingStrategy: "queued", estimatedDelayMs: 1000, priority: 90 }
```

---

## SLA Contracts (`economy/priority-economics.ts`)

```typescript
getSLAContract("tenant-enterprise-abc");
// {
//   tier: "enterprise",
//   maxQueueWaitMs: 1_000,
//   guaranteedThroughput: 500,    // events/minute
//   aiCallReservation: 500,       // reserved calls/hour
//   escalationSlaMs: 10_000,      // critical events escalated within 10s
// }
```

### SLA Compliance Check

```typescript
checkSLACompliance(tenantId, queueWaitMs: 2500, escalationMs: 15000);
// {
//   compliant: false,
//   violations: [
//     "Queue wait 2500ms exceeds 1000ms SLA",
//     "Escalation 15000ms exceeds 10000ms SLA"
//   ]
// }
```

SLA violations are logged and should trigger `sla_breach` events for monitoring.

---

## Resource Allocation

```typescript
allocateResources(tenantId, requestedCalls: 150);
// Enterprise: { granted: 150, queued: 0,   reason: "Full allocation granted" }
// Premium:    { granted: 100, queued: 50,  reason: "Reservation limit reached" }
// Standard:   { granted: 50,  queued: 100, reason: "Reservation limit reached" }
```

Queued calls are not dropped — they wait for the next allocation window (hourly reset).

---

## Priority Economics in Practice

**Scenario: Dispute + Territory analysis in queue simultaneously**

1. `dispute_opened` (tenant: standard) → base 90 + sla_boost 0 + retry 0 = **score 90**
2. `daily_territory_analysis` (tenant: enterprise) → base 20 + tier_boost 30 = **score 50**

Result: Dispute processes first (score 90 > 50), despite enterprise tenant. Event criticality trumps tenant tier for safety-critical events.

**Scenario: SLA breach imminent**

1. `job_accepted` (emergency urgency, SLA breach in 20 min) → base 65 + urgency 15 + sla 20 = **score 100 (critical)**
2. Normal `payment_captured` → base 70

Result: SLA-critical job processes first.
