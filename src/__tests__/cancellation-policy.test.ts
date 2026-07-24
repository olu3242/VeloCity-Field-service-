// Tests for the cancellation fee policy.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateCancellationPolicy } from "../lib/policies/cancellationRules";

describe("calculateCancellationPolicy — customer free cancellations", () => {
  const freeCancelStatuses = ["draft", "submitted", "awaiting_match", "offer_sent"];

  for (const status of freeCancelStatuses) {
    test(`no fee when customer cancels from '${status}'`, () => {
      const r = calculateCancellationPolicy({ status, actorRole: "customer", quotedCostCents: 20000 });
      assert.strictEqual(r.feeCents, 0);
      assert.strictEqual(r.event, "customer_cancel_before_accept");
    });
  }
});

describe("calculateCancellationPolicy — customer late cancellation fee", () => {
  test("10% fee after provider commitment", () => {
    const r = calculateCancellationPolicy({ status: "accepted", actorRole: "customer", quotedCostCents: 10000 });
    assert.strictEqual(r.feeCents, 1000); // 10% of 10000
    assert.strictEqual(r.event, "cancellation_fee_applied");
  });

  test("fee capped at $50 regardless of quote size", () => {
    const r = calculateCancellationPolicy({ status: "scheduled", actorRole: "customer", quotedCostCents: 200000 });
    assert.strictEqual(r.feeCents, 5000); // cap at $50.00
  });

  test("fee is 0 when no quoted cost", () => {
    const r = calculateCancellationPolicy({ status: "accepted", actorRole: "customer", quotedCostCents: null });
    assert.strictEqual(r.feeCents, 0);
    assert.strictEqual(r.event, "cancellation_fee_applied");
  });

  test("applies from in_progress status", () => {
    const r = calculateCancellationPolicy({ status: "in_progress", actorRole: "customer", quotedCostCents: 30000 });
    assert.strictEqual(r.feeCents, 3000);
  });
});

describe("calculateCancellationPolicy — provider/admin cancellation", () => {
  test("no fee when provider cancels", () => {
    const r = calculateCancellationPolicy({ status: "scheduled", actorRole: "provider", quotedCostCents: 50000 });
    assert.strictEqual(r.feeCents, 0);
    assert.strictEqual(r.event, "job_cancelled");
  });

  test("no fee when admin cancels", () => {
    const r = calculateCancellationPolicy({ status: "accepted", actorRole: "admin", quotedCostCents: 50000 });
    assert.strictEqual(r.feeCents, 0);
    assert.strictEqual(r.event, "job_cancelled");
  });
});
