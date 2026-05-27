# VeloCity Operational Timelines

## Overview

The timeline layer (`src/lib/timeline/`) maintains ordered audit trails for every entity (disputes, jobs, payouts, providers, customers, workflows) and AI decision — with tenant isolation enforced at read time.

---

## Event Chronology (`event-chronology.ts`)

Universal timeline for any tracked entity:

```typescript
recordEvent({
  entityType: "dispute",
  entityId: "d-123",
  tenantId: "tenant-abc",
  eventType: "dispute_opened",
  description: "Dispute opened for job J-456",
  actor: "customer-789",
  timestamp: new Date().toISOString(),
  metadata: { amount: 1200 },
});

getTimeline("dispute", "d-123", "tenant-abc");
// events sorted ascending by timestamp, filtered to tenantId

getRecentEvents("tenant-abc", 20);
// most recent 20 events across all entity types

getTimelineStats();
// { totalEntities, totalEvents, byEntityType }
```

**Cap:** 100 events per entity. Tenant isolation enforced via `assertTenantIsolation()` on read.

**Entity types:** `dispute` | `job` | `payout` | `provider` | `customer` | `workflow`

---

## Dispute Timeline (`dispute-timeline.ts`)

Specialized dispute lifecycle tracking:

```typescript
openDisputeTimeline("d-123", "tenant-abc", { jobId: "j-456", amount: 1200 });
addDisputeEvent("d-123", "tenant-abc", "evidence_submitted", "Provider submitted photos", "provider-789");
addDisputeEvent("d-123", "tenant-abc", "resolved_in_favor_of_customer", "IVY decision: 0.91 confidence", "IVY");

getDisputeTimeline("d-123", "tenant-abc");
// full ordered event list for this dispute
```

---

## AI Decision Timeline (`ai-decision-timeline.ts`)

Records every AI agent decision in chronological order:

```typescript
recordAIDecision({
  agentName: "IVY",
  eventType: "dispute_opened",
  tenantId: "tenant-abc",
  decision: "auto_resolve",
  confidence: 0.91,
  durationMs: 1840,
  metadata: { disputeId: "d-123" },
});

getAIDecisionsByAgent("IVY", "tenant-abc", 20);
getAIDecisionsByTenant("tenant-abc", 50);

getAIDecisionStats("tenant-abc");
// { total, avgConfidence, avgDurationMs, byAgent: { IVY: 34, FINN: 12 } }
```
