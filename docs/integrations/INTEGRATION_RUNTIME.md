# VeloCity Integration Runtime

## Overview

The integration runtime (`src/lib/integrations/`) provides a universal contract layer for all external system connections — normalizing webhooks, tracking delivery, and monitoring adapter health across every integration point.

---

## Adapter Contract (`adapter-contract.ts`)

All integrations are registered with a canonical contract:

```typescript
// Pre-registered adapters:
// stripe (payment, enabled), sendgrid (notification, disabled),
// twilio (communication, disabled), slack (ops-alerts, disabled)

const health = getAdapterHealth("stripe");
// {
//   adapterId: "stripe",
//   status: "healthy",
//   successRate: 0.997,
//   avgLatencyMs: 234,
//   consecutiveFailures: 0,
//   isCircuitOpen: false,
// }
```

Status derivation:
- `offline`: circuit open OR 0 success rate
- `degraded`: success rate < 0.95 OR consecutive failures ≥ 3
- `healthy`: otherwise

---

## Webhook Normalizer (`webhook-normalizer.ts`)

```typescript
const result = await normalizeWebhook({
  webhookId: "evt_stripe_xxx",
  source: "stripe",
  rawPayload: { type: "payment_intent.succeeded", data: { ... } },
  headers: { "stripe-signature": "t=..." },
  receivedAt: new Date().toISOString(),
});
// {
//   success: true,
//   webhookId: "evt_stripe_xxx",
//   internalEventType: "payment_captured",
//   isDuplicate: false,
// }
```

**Dedup:** Processed webhook IDs stored in-memory (10k cap, half-cleared on overflow). Duplicates return `isDuplicate: true` without re-emitting.

**Event type mapping:**
| Source | External Type | Internal Type |
|---|---|---|
| stripe | `payment_intent.succeeded` | `payment_captured` |
| stripe | `charge.dispute.created` | `dispute_opened` |
| partner | `job.completed` | `job_completed` |

---

## Delivery Tracker (`delivery-tracker.ts`)

```typescript
createDelivery({
  deliveryId: "del-xxx",
  adapterId: "sendgrid",
  eventType: "notification_email",
  tenantId: "tenant-abc",
  payload: { to: "...", template: "..." },
  maxAttempts: 3,
});

recordAttempt("del-xxx", true, 450);   // success
recordAttempt("del-xxx", false, 500, "Timeout");  // fail → next retry in 60s
// After 3 failures: status → dead_letter

replayDeadLetter("del-xxx");   // reset attempt count, back to pending
```

---

## Integration Health (`integration-health.ts`)

```typescript
monitorIntegrations();
// {
//   overallHealth: "healthy",
//   adapterCount: 4,
//   healthyAdapters: 3,
//   degradedAdapters: 0,
//   offlineAdapters: 0,
//   deadLetterCount: 2,
//   alerts: []
// }
```

`overallHealth`:
- `critical`: Stripe offline OR > 10 dead-letter items
- `degraded`: Any adapter degraded
- `healthy`: All adapters healthy, dead-letter count manageable

---

## Adding a New Integration

1. Register adapter: `registerAdapter({ adapterId: "quickbooks", name: "QuickBooks", type: "erp", ... })`
2. Add webhook mapping: `registerChannelMapping("quickbooks.invoice.paid", "payment_captured")`
3. Create delivery tracking: `createDelivery(...)` for outbound calls
4. Monitor: `getAdapterHealth("quickbooks")` in health dashboard
