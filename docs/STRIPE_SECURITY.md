# Stripe Security Guide

## Overview

VeloCity implements a four-layer Stripe security stack:

1. **Signature verification** — every webhook payload is verified using `stripe.webhooks.constructEvent`
2. **Replay protection** — event IDs are tracked in Redis/idempotency store
3. **Concurrent dedup** — `beginStripeEvent` prevents two instances processing the same event simultaneously
4. **Operation idempotency** — deterministic idempotency keys on all Stripe API calls

## Webhook Signature Verification

Every webhook request to `POST /api/webhooks/stripe` is verified before any
processing occurs:

```typescript
// src/lib/stripe/client.ts — constructWebhookEvent wraps stripe SDK
event = constructWebhookEvent(body, signature);
// Throws on invalid signature, expired timestamp, or malformed body.
```

The Stripe SDK validates:
- HMAC-SHA256 signature against `STRIPE_WEBHOOK_SECRET`
- Timestamp within ±300 seconds (replay window)

**Never trust unsigned payloads.** If `STRIPE_WEBHOOK_SECRET` is absent, all
webhooks are rejected with `400 No signature`.

## Replay Protection

Two-layer protection against duplicate event delivery:

### Layer 1: Redis idempotency store

```typescript
const replay = await checkStripeReplay(event.id);
if (replay.isDuplicate) {
  return NextResponse.json({ received: true, deduplicated: true });
}
```

Event IDs are stored in Redis with a 24-hour TTL. Across restarts and across
instances, the same event ID will never be processed twice.

### Layer 2: DB dedup_key column

`emitEvent` writes a `dedup_key` to the `automation_events` table (unique
constraint). Even if Redis is unavailable, DB-level dedup prevents double
processing at the event fan-out stage.

## Concurrent Processing Guard

```typescript
const acquired = await beginStripeEvent(event.id);
if (!acquired) {
  // Another instance holds the idempotency slot — Stripe will retry.
  return NextResponse.json({ error: "Event already being processed" }, { status: 409 });
}
```

The 409 response causes Stripe to retry with exponential backoff, which
will succeed once the first instance completes.

## Operation Idempotency Keys

All Stripe API calls use deterministic idempotency keys to prevent duplicate
charges, transfers, or refunds on retries:

```typescript
import { prefixed, paymentIntentKey } from "@/lib/stripe/idempotency";

const intent = await stripe.paymentIntents.create(
  { amount, currency: "usd", metadata: { job_id: jobId } },
  { idempotencyKey: prefixed(paymentIntentKey(jobId, paymentType)) }
);
```

### Key formats

| Operation | Key pattern |
|-----------|-------------|
| PaymentIntent create | `velocity:pi:{jobId}:{paymentType}` |
| Transfer (payout) | `velocity:tr:{paymentId}:{providerId}` |
| Refund | `velocity:re:{paymentIntentId}:{reason}` |
| Customer create | `velocity:cu:{userId}` |

## Event Ordering

Stripe does not guarantee event ordering. The platform handles out-of-order
delivery by:
- Using `dedup_key` to deduplicate, not to order
- Checking payment intent status before updating (idempotent DB updates)
- Using job FSM transitions that tolerate duplicate `status = X` writes

## Webhook Event Types Handled

| Event | Handler action |
|-------|---------------|
| `payment_intent.succeeded` | Escrow funds, advance job status |
| `payment_intent.payment_failed` | Mark payment failed, emit event |
| `payment_intent.canceled` | Mark payment cancelled |
| `transfer.created` | Record payout, emit event |
| `charge.dispute.created` | Open dispute, advance to `disputed` status |
| `invoice.payment_succeeded` | Record subscription payment |
| `invoice.payment_failed` | Record subscription failure |

## Security Checklist

- [x] Webhook signature verification via `stripe.webhooks.constructEvent`
- [x] Stripe SDK timestamp window (±300s) prevents old replay
- [x] Redis idempotency store prevents re-delivery replay
- [x] Concurrent dedup via `beginStripeEvent` / 409 to Stripe
- [x] Idempotency keys on PaymentIntent, Transfer, Refund
- [x] Tenant-scoped DB operations (`.eq("tenant_id", tenantId)`)
- [x] Service-role Supabase client for webhook processing (no RLS bypass)
- [x] `STRIPE_WEBHOOK_SECRET` validated at startup via env.ts

## Secrets Rotation

To rotate `STRIPE_WEBHOOK_SECRET`:
1. Add the new secret in the Stripe dashboard (keep both active)
2. Update `STRIPE_WEBHOOK_SECRET` in the environment
3. Deploy
4. Remove the old webhook signing secret in Stripe dashboard

The `constructWebhookEvent` call supports multiple secrets in newer Stripe SDK
versions. Rotate without downtime by keeping both secrets active during the
rolling deploy window.
