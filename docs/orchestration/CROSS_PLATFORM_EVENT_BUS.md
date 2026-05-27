# VeloCity Cross-Platform Event Bus

## Overview

The event bus (`src/lib/orchestration/event-bus.ts`) enables VeloCity to ingest events from external systems, partner platforms, and analytics pipelines — normalizing them into the internal event fabric.

```
External System
     ↓
ingestExternalEvent({ channel: "stripe", eventType: "payment_intent.succeeded", ... })
     ↓
Channel mapping lookup: "stripe.payment_intent.succeeded" → "payment_captured"
     ↓
emitEvent("payment_captured", normalizedPayload, tenantId)
     ↓
automation_queue → worker → finn-payment handler
```

---

## Supported Channels

| Channel | Description |
|---|---|
| `internal` | Internal platform events (used for testing/replay) |
| `stripe` | Stripe webhook events |
| `partner` | Partner service events (delivery, logistics) |
| `analytics` | Analytics system events |
| `crm` | CRM system events |
| `erp` | Enterprise resource planning events |

---

## Channel Mappings

Pre-registered external → internal event type mappings:

| External Event | Internal Event |
|---|---|
| `stripe.payment_intent.succeeded` | `payment_captured` |
| `stripe.payment_intent.payment_failed` | `payment_failed` |
| `stripe.charge.dispute.created` | `dispute_opened` |
| `partner.job.completed` | `job_completed` |
| `partner.provider.suspended` | `agent_run` |

Add custom mappings:
```typescript
registerChannelMapping("crm.contact.updated", "agent_run");
registerChannelMapping("partner.sla.breach", "sla_breach");
```

---

## Ingesting External Events

```typescript
const result = await ingestExternalEvent({
  externalId: "evt_stripe_xxx",
  channel: "stripe",
  eventType: "payment_intent.succeeded",
  source: "stripe-webhook",
  payload: { amount: 45000, customer: "cus_xxx", ... },
  tenantId: "tenant-abc",
});

// result:
// { success: true, internalEventType: "payment_captured", externalId: "evt_stripe_xxx" }
```

---

## Event Bus Observability

```typescript
getEventBusStats();
// {
//   total: 1842,
//   processed: 1830,
//   failed: 12,        // no mapping found
//   byChannel: { stripe: 1200, partner: 642 }
// }

getRecentEvents(20);   // last 20 events with processed status
```

Failed events (no mapping found) are logged in the bus log and should be reviewed for missing adapter coverage.

---

## Partner Integration Pattern

For partner platforms sending operational events:

1. Partner calls `POST /api/webhooks/partner` with event payload
2. Webhook handler calls `ingestExternalEvent({ channel: "partner", ... })`
3. Event bus maps to internal type or logs as unmapped
4. Internal event processes through standard queue → handler flow

Partner webhooks must include:
- `X-Partner-Id` header (maps to `tenantId`)
- `X-Partner-Signature` for HMAC verification (same pattern as Stripe)
- `externalId` in payload for deduplication

---

## Replay Safety

Each external event carries an `externalId`. The event bus stores the full log in-memory. For DB-backed replay safety (planned):
- Store `externalId` in `automation_events.dedup_key`
- Duplicate `externalId` submissions return the existing internal event
- Enables safe retry from external systems without double-processing

---

## Production Considerations

**Current:** In-memory event log (last ~N events, resets on restart).

**Production path:**
- Persist `ExternalEvent` log to `external_events` table
- Add `externalId` unique constraint for DB-level deduplication
- Expose `/api/webhooks/bus` for generic partner event ingestion
- Add per-channel authentication (API keys, HMAC signatures)
