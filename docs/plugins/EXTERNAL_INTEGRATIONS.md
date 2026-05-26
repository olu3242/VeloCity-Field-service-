# VeloCity External Integrations

All external integrations operate through **standardized adapters** in `src/lib/plugins/adapters/`. No handler or agent calls an external API directly.

```
Platform event
     ↓
Adapter (stripe-adapter | crm-adapter | notification-adapter)
     ↓
External API call (or stub with console.log in dev)
     ↓
Result → emitEvent() for internal follow-up (if needed)
     ↓
agent_logs / audit_logs record
```

---

## Stripe Adapter (`adapters/stripe-adapter.ts`)

Routes inbound Stripe webhook events to internal platform events.

| Stripe Event | Internal Event |
|---|---|
| `payment_intent.succeeded` | `payment_captured` |
| `payment_intent.payment_failed` | `payment_failed` |
| `charge.dispute.created` | `dispute_opened` + `chargeback_opened` |
| `payout.paid` | `payout_released` |

```typescript
// In webhook handler:
const result = await handleStripeWebhook({ type: event.type, data: event.data.object });
// result.handled: true | false
// result.action: "emitted_payment_captured" | ...
```

**Status:** Active (wired to `/api/webhooks/stripe/route.ts`)

---

## Notification Adapter (`adapters/notification-adapter.ts`)

Unified routing layer for all notification channels.

| Channel | Status | Provider |
|---|---|---|
| `in_app` | ✅ Active | Supabase (`notifications` table) |
| `email` | 🔧 Pending | SendGrid |
| `sms` | 🔧 Pending | Twilio |
| `slack` | 🔧 Pending | Slack API |
| `push` | 🔧 Pending | FCM |

```typescript
await routeNotification({
  channel: "in_app",
  recipient: { userId: "user-uuid" },
  template: "dispute_resolved",
  data: { dispute_id, resolution },
  tenantId: "tenant-id",
  priority: "high",
});
```

Pending channels return `{ sent: false, error: "Provider not configured" }` without throwing — core execution continues.

---

## CRM Adapter (`adapters/crm-adapter.ts`)

Generic CRM sync for customer/provider contact management.

**Supported providers (configurable):** HubSpot, Salesforce, Generic

```typescript
const result = await syncContact({
  externalId: userId,
  email: user.email,
  name: user.full_name,
  customerId: userId,
  tags: ["velocity-customer"],
  metadata: { totalJobs, avgRating },
});
```

**Status:** Disabled by default (`DEFAULT_CRM_CONFIG.enabled = false`). Enable per-tenant via tenant config.

CRM webhook ingestion handled via `handleCRMWebhook()` — maps CRM contact events to internal user update events.

---

## Integration Roadmap

| Integration | Priority | Adapter Status |
|---|---|---|
| Stripe (payments) | P0 | ✅ Active |
| Supabase (notifications) | P0 | ✅ Active |
| SendGrid (email) | P1 | Stub implemented |
| Twilio (SMS) | P1 | Stub implemented |
| Slack (ops alerts) | P1 | Stub implemented |
| HubSpot (CRM) | P2 | Adapter ready, disabled |
| FCM (push notifications) | P2 | Stub implemented |
| QuickBooks (accounting/ERP) | P3 | Not started |
| Segment (analytics) | P3 | Not started |

---

## Adding a New Integration

1. Create `src/lib/plugins/adapters/{provider}-adapter.ts`
2. Define config interface + default config
3. Implement event mapping (external → internal via emitEvent)
4. Register as plugin in `PLUGIN_REGISTRY` with appropriate hooks
5. Add webhook route if inbound (e.g., `/api/webhooks/{provider}/route.ts`)
6. Document here with status and event mapping table

**All adapters must:**
- Emit internal events (never call handlers directly)
- Return structured result (never throw to caller)
- Support replay safety (idempotent event emission)
- Log intent even when provider not configured
