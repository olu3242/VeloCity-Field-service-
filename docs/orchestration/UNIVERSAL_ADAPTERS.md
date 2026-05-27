# VeloCity Universal Adapter System

## Architecture

All external system integrations use standardized adapters. Adapters translate between external protocols and VeloCity's internal event fabric.

```
External System (Stripe, CRM, ERP, ...)
        ↓
Adapter (src/lib/plugins/adapters/ or src/lib/orchestration/adapters/)
        ↓
emitEvent(internalType, normalizedPayload)
        ↓
automation_queue → worker → handler
```

**Rule:** Adapters emit events. They never call handlers directly.

---

## Adapter Contract

Every adapter must implement:

1. **Config interface** — `AdapterConfig` with `enabled` boolean
2. **Event mapping** — external event type → internal `AutomationEventType`
3. **Inbound handler** — `handle{Provider}Webhook(event)` → `{ handled: boolean; action?: string }`
4. **Error safety** — all errors caught, never throw to caller
5. **Replay safety** — idempotent emission (use `dedup_key` = `${externalId}-${eventType}`)
6. **Observability** — log all events (handled and unhandled)

---

## Active Adapters

### Stripe Adapter (`plugins/adapters/stripe-adapter.ts`)
**Status:** Active | **Events:** 4 inbound mappings

| Stripe Event | Internal Event |
|---|---|
| `payment_intent.succeeded` | `payment_captured` |
| `payment_intent.payment_failed` | `payment_failed` |
| `charge.dispute.created` | `dispute_opened` + `chargeback_opened` |
| `payout.paid` | `payout_released` |

### Notification Adapter (`plugins/adapters/notification-adapter.ts`)
**Status:** Partial | `in_app` active, others stubbed

Routes internal notification requests to the appropriate delivery provider.

### CRM Adapter (`orchestration/adapters/crm-adapter.ts`)
**Status:** Disabled | Ready to activate via config

Maps CRM contact events to internal user profile updates. Supports HubSpot/Salesforce/Generic pattern.

---

## Adapter Registry

| Adapter | Type | Status | Priority |
|---|---|---|---|
| Stripe | Payment | ✅ Active | P0 |
| Supabase Notifications | In-App | ✅ Active | P0 |
| SendGrid | Email | 🔧 Stub | P1 |
| Twilio | SMS | 🔧 Stub | P1 |
| Slack | Ops Alerts | 🔧 Stub | P1 |
| CRM (Generic) | Customer Sync | ⚙️ Disabled | P2 |
| FCM | Push | 🔧 Stub | P2 |
| QuickBooks | ERP/Accounting | ❌ Not started | P3 |
| Segment | Analytics | ❌ Not started | P3 |
| Salesforce | CRM | ❌ Not started | P3 |

---

## Building a New Adapter

```typescript
// src/lib/orchestration/adapters/sendgrid-adapter.ts

export interface SendGridConfig {
  enabled: boolean;
  apiKey?: string;
  fromEmail: string;
}

export const DEFAULT_SENDGRID_CONFIG: SendGridConfig = {
  enabled: false,
  fromEmail: "noreply@velocity.app",
};

export async function sendEmail(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!DEFAULT_SENDGRID_CONFIG.enabled) {
    return { sent: false, error: "SendGrid not configured" };
  }
  // Real SendGrid call here
  return { sent: true, messageId: "sg-xxx" };
}
```

Then register in plugin registry:
```typescript
registerPlugin({
  id: "sendgrid-email",
  type: "notification",
  hooks: [{ event: "on:notification_email", handler: "sendEmail", priority: 5, async: true }],
  status: "disabled", // enable when apiKey configured
});
```
