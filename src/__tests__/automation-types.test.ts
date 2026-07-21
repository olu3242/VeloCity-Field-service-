import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type {
  AutomationEventType,
  HandlerResult,
  AutomationQueueItem,
  AutomationPayload,
  ServiceRequestCreatedPayload,
  DisputeOpenedPayload,
  TipSubmittedPayload,
} from "../types/automation";

// Runtime-accessible list of a representative subset of event types that must
// be present in the union, used to guard against accidental deletions.
const REQUIRED_EVENT_TYPES: AutomationEventType[] = [
  "service_request_created",
  "review_requested",
  "dispute_opened",
  "job_completed",
  "payment_captured",
  "payout_released",
  "payout_failed",
];

describe("AutomationEventType", () => {
  test("review_requested is assignable and is a non-empty string", () => {
    const eventType: AutomationEventType = "review_requested";
    assert.strictEqual(typeof eventType, "string");
    assert.ok(eventType.length > 0);
  });

  test("all required event type values are non-empty strings", () => {
    for (const type of REQUIRED_EVENT_TYPES) {
      assert.strictEqual(typeof type, "string", `${type} should be a string`);
      assert.ok(type.length > 0, `${type} should be non-empty`);
    }
  });

  test("event type strings use snake_case format", () => {
    const snakeCasePattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
    for (const type of REQUIRED_EVENT_TYPES) {
      assert.match(type, snakeCasePattern, `${type} should be snake_case`);
    }
  });
});

describe("HandlerResult", () => {
  test("minimal HandlerResult with success=true is valid", () => {
    const result: HandlerResult = { success: true };
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.output, undefined);
    assert.strictEqual(result.emitEvents, undefined);
  });

  test("HandlerResult with success=false and error is valid", () => {
    const result: HandlerResult = { success: false, error: "something went wrong" };
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "something went wrong");
  });

  test("HandlerResult can carry output and emitEvents", () => {
    const result: HandlerResult = {
      success: true,
      output: { jobId: "j-123", amount: 500 },
      emitEvents: [
        { type: "review_requested", payload: { job_id: "j-123" } as AutomationPayload },
        { type: "payout_queued", payload: { job_id: "j-123", provider_id: "p-1", amount_cents: 400, platform_fee_cents: 100, net_payout_cents: 300, release_after: "2025-01-01" } as AutomationPayload },
      ],
    };
    assert.ok(result.success);
    assert.ok(Array.isArray(result.emitEvents));
    assert.strictEqual(result.emitEvents!.length, 2);
    assert.strictEqual(result.emitEvents![0].type, "review_requested");
  });

  test("emitEvents can include a dedupKey", () => {
    const result: HandlerResult = {
      success: true,
      emitEvents: [
        {
          type: "dispute_opened",
          payload: { job_id: "j-1", dispute_id: "d-1", customer_id: "c-1", provider_id: "p-1", reason: "no show" } as AutomationPayload,
          dedupKey: "dispute-d-1",
        },
      ],
    };
    assert.strictEqual(result.emitEvents![0].dedupKey, "dispute-d-1");
  });
});

describe("AutomationQueueItem", () => {
  test("has the expected shape with required fields", () => {
    const item: AutomationQueueItem = {
      id: "q-abc",
      event_id: null,
      event_type: "job_completed",
      payload: { job_id: "j-1", provider_id: "p-1", customer_id: "c-1", total_cents: 10000 } as AutomationPayload,
      status: "pending",
      retry_count: 0,
      max_retries: 3,
      next_retry_at: new Date().toISOString(),
      dedup_key: null,
      error_message: null,
      created_at: new Date().toISOString(),
      processed_at: null,
    };

    assert.strictEqual(item.id, "q-abc");
    assert.strictEqual(item.event_type, "job_completed");
    assert.strictEqual(item.status, "pending");
    assert.strictEqual(item.retry_count, 0);
    assert.strictEqual(item.max_retries, 3);
    assert.strictEqual(item.error_message, null);
  });
});

describe("Payload shapes", () => {
  test("ServiceRequestCreatedPayload has required fields", () => {
    const payload: ServiceRequestCreatedPayload = {
      job_id: "j-1",
      customer_id: "c-1",
      category: "plumbing",
      urgency: "same_day",
      zip: "90210",
      title: "Fix leak",
      description: "Water under the sink",
    };
    assert.strictEqual(payload.job_id, "j-1");
    assert.strictEqual(payload.category, "plumbing");
  });

  test("DisputeOpenedPayload has required fields", () => {
    const payload: DisputeOpenedPayload = {
      job_id: "j-2",
      dispute_id: "d-1",
      customer_id: "c-2",
      provider_id: "p-2",
      reason: "Work was incomplete",
    };
    assert.strictEqual(payload.dispute_id, "d-1");
    assert.strictEqual(payload.reason, "Work was incomplete");
  });

  test("TipSubmittedPayload has required fields including optional note", () => {
    const withNote: TipSubmittedPayload = {
      tip_id: "t-1",
      job_id: "j-1",
      provider_id: "p-1",
      customer_id: "c-1",
      amount_cents: 500,
      note: "Great job!",
    };
    const withoutNote: TipSubmittedPayload = {
      tip_id: "t-2",
      job_id: "j-2",
      provider_id: "p-2",
      customer_id: "c-2",
      amount_cents: 1000,
    };
    assert.strictEqual(withNote.amount_cents, 500);
    assert.strictEqual(withNote.note, "Great job!");
    assert.strictEqual(withoutNote.note, undefined);
  });
});
