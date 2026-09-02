// Tests for the job FSM — validates that allowed transitions, role guards,
// and reason requirements are all correct.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  getAvailableTransitions,
  getJobProgressPercent,
  TERMINAL_STATES,
  ACTIVE_STATES,
  CUSTOMER_ACTION_STATES,
  PROVIDER_ACTION_STATES,
} from "../lib/workflows/job-state-machine";
import type { JobStatus } from "../types";

describe("canTransition — happy path", () => {
  test("customer can submit a draft", () => {
    const r = canTransition("draft", "submitted", "customer");
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.requiresReason, false);
  });

  test("provider can accept an offer", () => {
    const r = canTransition("offer_sent", "accepted", "provider");
    assert.strictEqual(r.allowed, true);
  });

  test("customer can approve a quote", () => {
    const r = canTransition("awaiting_quote_approval", "quote_approved", "customer");
    assert.strictEqual(r.allowed, true);
  });

  test("provider can mark job complete", () => {
    const r = canTransition("in_progress", "completed_pending_confirmation", "provider");
    assert.strictEqual(r.allowed, true);
  });

  test("customer can confirm completion", () => {
    const r = canTransition("completed_pending_confirmation", "customer_confirmed", "customer");
    assert.strictEqual(r.allowed, true);
  });

  test("admin can finalize a customer-confirmed job", () => {
    const r = canTransition("customer_confirmed", "completed", "admin");
    assert.strictEqual(r.allowed, true);
  });
});

describe("canTransition — role enforcement", () => {
  test("customer cannot send an offer to providers", () => {
    const r = canTransition("awaiting_match", "offer_sent", "customer");
    assert.strictEqual(r.allowed, false);
  });

  test("provider cannot submit a job (no role)", () => {
    const r = canTransition("draft", "submitted", "provider");
    assert.strictEqual(r.allowed, false);
  });

  test("customer cannot finalize a completed job", () => {
    const r = canTransition("customer_confirmed", "completed", "customer");
    assert.strictEqual(r.allowed, false);
  });

  test("provider cannot approve a quote", () => {
    const r = canTransition("awaiting_quote_approval", "quote_approved", "provider");
    assert.strictEqual(r.allowed, false);
  });
});

describe("canTransition — requiresReason flag", () => {
  test("cancellation from submitted requires reason", () => {
    const r = canTransition("submitted", "cancelled", "admin");
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.requiresReason, true);
  });

  test("customer dispute from completed requires reason", () => {
    const r = canTransition("completed", "disputed", "customer");
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.requiresReason, true);
  });

  test("no_show transition requires reason", () => {
    const r = canTransition("en_route", "no_show", "customer");
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.requiresReason, true);
  });

  test("normal progression does not require reason", () => {
    const r = canTransition("accepted", "scheduled", "provider");
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.requiresReason, false);
  });
});

describe("canTransition — terminal states", () => {
  test("no transitions from closed", () => {
    const transitions = getAvailableTransitions("closed", "admin");
    assert.strictEqual(transitions.length, 0);
  });

  test("no transitions from cancelled", () => {
    const transitions = getAvailableTransitions("cancelled", "admin");
    assert.strictEqual(transitions.length, 0);
  });

  test("closed is listed in TERMINAL_STATES", () => {
    assert.ok(TERMINAL_STATES.includes("closed"));
  });

  test("cancelled is listed in TERMINAL_STATES", () => {
    assert.ok(TERMINAL_STATES.includes("cancelled"));
  });
});

describe("getAvailableTransitions", () => {
  test("provider sees offer options from offer_sent", () => {
    const t = getAvailableTransitions("offer_sent", "provider");
    const tos = t.map((x) => x.to);
    assert.ok(tos.includes("accepted"), "should be able to accept");
    assert.ok(tos.includes("awaiting_match"), "should be able to reject/pass");
  });

  test("customer sees approve and reject from awaiting_quote_approval", () => {
    const t = getAvailableTransitions("awaiting_quote_approval", "customer");
    const tos = t.map((x) => x.to);
    assert.ok(tos.includes("quote_approved"));
    assert.ok(tos.includes("cancelled"));
  });

  test("admin sees more options than customer from awaiting_match", () => {
    const adminT = getAvailableTransitions("awaiting_match", "admin");
    const customerT = getAvailableTransitions("awaiting_match", "customer");
    assert.ok(adminT.length > customerT.length);
  });

  test("returns empty array for unknown status", () => {
    const t = getAvailableTransitions("nonexistent" as JobStatus, "admin");
    assert.strictEqual(t.length, 0);
  });
});

describe("getJobProgressPercent", () => {
  test("draft is 5%", () => {
    assert.strictEqual(getJobProgressPercent("draft"), 5);
  });

  test("completed is 100%", () => {
    assert.strictEqual(getJobProgressPercent("completed"), 100);
  });

  test("in_progress is 75%", () => {
    assert.strictEqual(getJobProgressPercent("in_progress"), 75);
  });

  test("cancelled is 0%", () => {
    assert.strictEqual(getJobProgressPercent("cancelled"), 0);
  });

  test("unknown status returns 0", () => {
    assert.strictEqual(getJobProgressPercent("unknown_status" as JobStatus), 0);
  });
});

describe("state classification arrays", () => {
  test("ACTIVE_STATES includes in_progress", () => {
    assert.ok(ACTIVE_STATES.includes("in_progress"));
  });

  test("ACTIVE_STATES includes en_route", () => {
    assert.ok(ACTIVE_STATES.includes("en_route"));
  });

  test("CUSTOMER_ACTION_STATES includes awaiting_quote_approval", () => {
    assert.ok(CUSTOMER_ACTION_STATES.includes("awaiting_quote_approval"));
  });

  test("CUSTOMER_ACTION_STATES includes completed_pending_confirmation", () => {
    assert.ok(CUSTOMER_ACTION_STATES.includes("completed_pending_confirmation"));
  });

  test("PROVIDER_ACTION_STATES includes offer_sent", () => {
    assert.ok(PROVIDER_ACTION_STATES.includes("offer_sent"));
  });

  test("PROVIDER_ACTION_STATES includes scheduled", () => {
    assert.ok(PROVIDER_ACTION_STATES.includes("scheduled"));
  });
});
