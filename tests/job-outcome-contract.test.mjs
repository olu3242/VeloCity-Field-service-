import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJobOutcome } from "../src/lib/outcomes/job-outcome-contract.ts";

const baseFacts = {
  status: "submitted",
  classificationPresent: false,
  providerAssigned: false,
  beforeEvidenceCount: 0,
  afterEvidenceCount: 0,
  customerConfirmed: false,
  capturedPaymentCount: 0,
  auditEventCount: 0,
  unresolvedDisputeCount: 0,
};

test("a new request exposes the missing intake evidence", () => {
  const outcome = evaluateJobOutcome(baseFacts);

  assert.equal(outcome.stage, "intake");
  assert.equal(outcome.verdict, "in_progress");
  assert.equal(outcome.progressPercent, 0);
  assert.match(outcome.nextAction, /Classification evidence/);
});

test("a dispatched job advances to execution without claiming completion", () => {
  const outcome = evaluateJobOutcome({
    ...baseFacts,
    status: "accepted",
    classificationPresent: true,
    providerAssigned: true,
    auditEventCount: 2,
  });

  assert.equal(outcome.stage, "execution");
  assert.equal(outcome.verdict, "in_progress");
  assert.equal(outcome.checkpoints.find((item) => item.id === "governed_dispatch")?.satisfied, true);
});

test("customer confirmation blocks for human action until closeout evidence exists", () => {
  const outcome = evaluateJobOutcome({
    ...baseFacts,
    status: "completed_pending_confirmation",
    classificationPresent: true,
    providerAssigned: true,
    beforeEvidenceCount: 1,
    afterEvidenceCount: 1,
    auditEventCount: 6,
  });

  assert.equal(outcome.stage, "verification");
  assert.equal(outcome.verdict, "blocked");
  assert.equal(outcome.requiresHumanAction, true);
});

test("only complete evidence, confirmation, payment, audit, and recovery satisfy the outcome", () => {
  const outcome = evaluateJobOutcome({
    ...baseFacts,
    status: "completed",
    classificationPresent: true,
    providerAssigned: true,
    beforeEvidenceCount: 2,
    afterEvidenceCount: 2,
    customerConfirmed: true,
    capturedPaymentCount: 1,
    auditEventCount: 9,
  });

  assert.equal(outcome.stage, "complete");
  assert.equal(outcome.verdict, "satisfied");
  assert.equal(outcome.progressPercent, 100);
  assert.equal(outcome.nextAction, null);
});

test("an unresolved dispute prevents a false-positive completion", () => {
  const outcome = evaluateJobOutcome({
    ...baseFacts,
    status: "completed",
    classificationPresent: true,
    providerAssigned: true,
    beforeEvidenceCount: 1,
    afterEvidenceCount: 1,
    customerConfirmed: true,
    capturedPaymentCount: 1,
    auditEventCount: 7,
    unresolvedDisputeCount: 1,
  });

  assert.equal(outcome.verdict, "blocked");
  assert.equal(outcome.requiresHumanAction, true);
  assert.match(outcome.nextAction, /unresolved dispute/);
});

test("terminal failure never reports a satisfied outcome", () => {
  const outcome = evaluateJobOutcome({
    ...baseFacts,
    status: "cancelled",
    classificationPresent: true,
    providerAssigned: true,
    beforeEvidenceCount: 1,
    afterEvidenceCount: 1,
    customerConfirmed: true,
    capturedPaymentCount: 1,
    auditEventCount: 7,
  });

  assert.equal(outcome.verdict, "failed");
});

