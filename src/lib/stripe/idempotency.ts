// Stripe operation idempotency keys.
// Generates deterministic idempotency keys so Stripe deduplicates API calls
// on retry (network failures, timeouts, etc.).

/**
 * Generate an idempotency key for a Stripe PaymentIntent creation.
 * The key is stable for the same job + payment type combination.
 */
export function paymentIntentKey(jobId: string, paymentType: string): string {
  return `pi:${jobId}:${paymentType}`;
}

/**
 * Generate an idempotency key for a Stripe transfer (provider payout).
 */
export function transferKey(paymentId: string, providerId: string): string {
  return `tr:${paymentId}:${providerId}`;
}

/**
 * Generate an idempotency key for a Stripe refund.
 */
export function refundKey(paymentIntentId: string, reason: string): string {
  return `re:${paymentIntentId}:${reason}`;
}

/**
 * Generate an idempotency key for a Stripe customer creation.
 */
export function customerKey(userId: string): string {
  return `cu:${userId}`;
}

/**
 * Prefix for all Velocity-generated idempotency keys.
 * Allows filtering in Stripe dashboard logs.
 */
export function prefixed(key: string): string {
  return `velocity:${key}`;
}
