// Stripe webhook replay protection.
// Checks the Stripe event ID against already-processed events to prevent
// duplicate processing when Stripe retries a webhook delivery.
//
// Two-layer defense:
//   1. Redis idempotency store (distributed, expires after 24h)
//   2. automation_events dedup_key column (durable, permanent)

import {
  beginIdempotent,
  completeIdempotent,
  isAlreadyProcessed,
} from "@/lib/redis/idempotency";

const NAMESPACE = "stripe-event";

export interface ReplayCheckResult {
  isDuplicate: boolean;
  layer: "redis" | "none";
}

/**
 * Check whether a Stripe event has already been processed.
 * Returns { isDuplicate: true } if the event should be skipped.
 */
export async function checkStripeReplay(
  stripeEventId: string
): Promise<ReplayCheckResult> {
  const already = await isAlreadyProcessed(NAMESPACE, stripeEventId);
  if (already) return { isDuplicate: true, layer: "redis" };
  return { isDuplicate: false, layer: "none" };
}

/**
 * Mark a Stripe event as being processed (acquires idempotency slot).
 * Returns false if another instance is already processing this event.
 */
export async function beginStripeEvent(stripeEventId: string): Promise<boolean> {
  return beginIdempotent(NAMESPACE, stripeEventId);
}

/**
 * Mark a Stripe event as successfully processed.
 * Subsequent calls to checkStripeReplay will return { isDuplicate: true }.
 */
export async function completeStripeEvent(
  stripeEventId: string,
  eventType: string
): Promise<void> {
  await completeIdempotent(NAMESPACE, stripeEventId, eventType);
}
