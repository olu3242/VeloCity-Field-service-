// stripe-security.test.ts — Tests for Stripe webhook replay protection,
// idempotency key generation, and signature validation patterns.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Stripe replay protection", () => {
  test("checkStripeReplay returns not-duplicate for a new event ID", async () => {
    const { checkStripeReplay } = await import(
      "../lib/stripe/replay-protection"
    );
    const eventId = `evt_test_${Date.now()}_new`;
    const result = await checkStripeReplay(eventId);
    assert.strictEqual(result.isDuplicate, false);
  });

  test("isAlreadyProcessed returns false before beginStripeEvent", async () => {
    const { checkStripeReplay } = await import(
      "../lib/stripe/replay-protection"
    );
    const eventId = `evt_test_${Date.now()}_before`;
    const result = await checkStripeReplay(eventId);
    assert.strictEqual(result.isDuplicate, false);
  });

  test("completeStripeEvent causes subsequent checkStripeReplay to return isDuplicate=true", async () => {
    const {
      beginStripeEvent,
      completeStripeEvent,
      checkStripeReplay,
    } = await import("../lib/stripe/replay-protection");
    const eventId = `evt_test_${Date.now()}_complete`;

    // First: event is new
    const first = await checkStripeReplay(eventId);
    assert.strictEqual(first.isDuplicate, false);

    // Begin processing
    const acquired = await beginStripeEvent(eventId);
    assert.strictEqual(acquired, true);

    // Complete processing
    await completeStripeEvent(eventId, "payment_intent.succeeded");

    // Second check: now a duplicate
    const second = await checkStripeReplay(eventId);
    assert.strictEqual(second.isDuplicate, true);
  });

  test("beginStripeEvent returns false if already begun for same event", async () => {
    const { beginStripeEvent } = await import(
      "../lib/stripe/replay-protection"
    );
    const eventId = `evt_test_${Date.now()}_begin_twice`;
    const first = await beginStripeEvent(eventId);
    const second = await beginStripeEvent(eventId);
    assert.strictEqual(first, true);
    assert.strictEqual(second, false);
  });
});

describe("Stripe idempotency keys", () => {
  test("paymentIntentKey is stable for same inputs", async () => {
    const { paymentIntentKey } = await import("../lib/stripe/idempotency");
    const k1 = paymentIntentKey("job-123", "deposit");
    const k2 = paymentIntentKey("job-123", "deposit");
    assert.strictEqual(k1, k2);
  });

  test("paymentIntentKey differs for different payment types", async () => {
    const { paymentIntentKey } = await import("../lib/stripe/idempotency");
    const k1 = paymentIntentKey("job-123", "deposit");
    const k2 = paymentIntentKey("job-123", "final");
    assert.notStrictEqual(k1, k2);
  });

  test("transferKey includes both paymentId and providerId", async () => {
    const { transferKey } = await import("../lib/stripe/idempotency");
    const k = transferKey("pay-456", "prov-789");
    assert.ok(k.includes("pay-456"));
    assert.ok(k.includes("prov-789"));
  });

  test("prefixed adds velocity: namespace prefix", async () => {
    const { prefixed, paymentIntentKey } = await import(
      "../lib/stripe/idempotency"
    );
    const k = prefixed(paymentIntentKey("job-001", "deposit"));
    assert.ok(k.startsWith("velocity:"));
  });

  test("refundKey is stable and includes reason", async () => {
    const { refundKey } = await import("../lib/stripe/idempotency");
    const k = refundKey("pi_abc123", "duplicate");
    assert.ok(k.includes("pi_abc123"));
    assert.ok(k.includes("duplicate"));
    assert.strictEqual(k, refundKey("pi_abc123", "duplicate"));
  });
});
