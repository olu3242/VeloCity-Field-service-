// Workstream Reliability Framework — unit tests
// Covers: WorkstreamError, WorkstreamErrors factories, recovery utilities, registry, session continuity.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  WorkstreamError,
  WorkstreamErrors,
  toWorkstreamError,
} from "../lib/workstream/errors";
import {
  withRetry,
  withFallback,
  withCircuitSkip,
} from "../lib/workstream/recovery";
import {
  WORKSTREAM_REGISTRY,
  PLATFORM_DEPENDENCIES,
  getWorkstream,
  getCriticalWorkstreams,
  getWorkstreamsByCategory,
} from "../lib/workstream/registry";
import { buildRootCauseAnalysis } from "../lib/workstream/diagnostics";

// ── WorkstreamError ───────────────────────────────────────────────────────────

describe("WorkstreamError", () => {
  test("extends Error", () => {
    const e = new WorkstreamError({
      message: "test failed",
      code: "TEST_ERR",
      httpStatus: 500,
      stage: "execute",
      retryable: false,
    });
    assert.ok(e instanceof Error);
    assert.ok(e instanceof WorkstreamError);
  });

  test("exposes all structured fields", () => {
    const e = new WorkstreamError({
      message: "dependency offline",
      code: "DEP_ERR",
      httpStatus: 503,
      dependency: "supabase",
      stage: "load-dependencies",
      retryable: true,
      suggestedActions: ["Retry"],
      correlationId: "corr-xyz",
    });
    assert.strictEqual(e.code, "DEP_ERR");
    assert.strictEqual(e.httpStatus, 503);
    assert.strictEqual(e.dependency, "supabase");
    assert.strictEqual(e.stage, "load-dependencies");
    assert.strictEqual(e.retryable, true);
    assert.ok(e.suggestedActions.includes("Retry"));
    assert.strictEqual(e.correlationId, "corr-xyz");
    assert.ok(e.timestamp);
  });

  test("toPayload returns a flat object with all display fields", () => {
    const e = new WorkstreamError({
      message: "execution failed",
      code: "EXEC_ERR",
      httpStatus: 500,
      stage: "execute",
      retryable: false,
      suggestedActions: ["Open Diagnostics"],
      correlationId: "corr-001",
    });
    const p = e.toPayload();
    assert.strictEqual(p.code, "EXEC_ERR");
    assert.ok(p.title);
    assert.ok(p.statusLabel);
    assert.strictEqual(typeof p.httpStatus, "number");
    assert.ok(Array.isArray(p.suggestedActions));
  });
});

// ── toWorkstreamError ─────────────────────────────────────────────────────────

describe("toWorkstreamError", () => {
  test("passes through WorkstreamError unchanged", () => {
    const original = WorkstreamErrors.executionFailed("test");
    const result = toWorkstreamError(original, "corr");
    assert.strictEqual(result, original);
  });

  test("wraps a plain Error", () => {
    const plain = new Error("something broke");
    const result = toWorkstreamError(plain, "corr-1");
    assert.ok(result instanceof WorkstreamError);
    assert.ok(result.message.includes("something broke"));
  });

  test("wraps a string", () => {
    const result = toWorkstreamError("network error", "corr-2");
    assert.ok(result instanceof WorkstreamError);
  });

  test("wraps null gracefully", () => {
    assert.doesNotThrow(() => toWorkstreamError(null, "c"));
  });

  test("wraps undefined gracefully", () => {
    assert.doesNotThrow(() => toWorkstreamError(undefined, "c"));
  });
});

// ── WorkstreamErrors factories ────────────────────────────────────────────────

describe("WorkstreamErrors factories", () => {
  test("authRequired returns 401", () => {
    const e = WorkstreamErrors.authRequired();
    assert.strictEqual(e.httpStatus, 401);
    assert.ok(e.code.includes("AUTH"));
  });

  test("sessionExpired returns 401", () => {
    const e = WorkstreamErrors.sessionExpired();
    assert.strictEqual(e.httpStatus, 401);
  });

  test("tenantResolutionFailed returns 403", () => {
    const e = WorkstreamErrors.tenantResolutionFailed();
    assert.strictEqual(e.httpStatus, 403);
  });

  test("permissionDenied returns 403", () => {
    const e = WorkstreamErrors.permissionDenied("dispatch");
    assert.strictEqual(e.httpStatus, 403);
  });

  test("dependencyUnavailable includes dependency name", () => {
    const e = WorkstreamErrors.dependencyUnavailable("supabase");
    assert.strictEqual(e.dependency, "supabase");
    assert.strictEqual(e.httpStatus, 503);
    assert.strictEqual(e.retryable, true);
  });

  test("dependencyTimeout returns 504", () => {
    const e = WorkstreamErrors.dependencyTimeout("redis");
    assert.strictEqual(e.httpStatus, 504);
    assert.strictEqual(e.dependency, "redis");
  });

  test("executionFailed returns 500", () => {
    const e = WorkstreamErrors.executionFailed("dispatch");
    assert.strictEqual(e.httpStatus, 500);
  });

  test("membershipRequired returns 402", () => {
    const e = WorkstreamErrors.membershipRequired("pro");
    assert.strictEqual(e.httpStatus, 402);
  });
});

// ── withRetry ─────────────────────────────────────────────────────────────────

describe("withRetry", () => {
  test("returns result on first success", async () => {
    let calls = 0;
    const fn = async () => { calls++; return 42; };
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 }, "execute");
    assert.strictEqual(result, 42);
    assert.strictEqual(calls, 1);
  });

  test("retries on failure and eventually succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new WorkstreamError({ message: "transient", code: "TRANS", retryable: true });
      return "ok";
    };
    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 0, maxDelayMs: 0 }, "execute");
    assert.strictEqual(result, "ok");
    assert.strictEqual(calls, 3);
  });

  test("throws after maxAttempts exhausted", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new WorkstreamError({ message: "persistent", code: "PERM", retryable: true });
    };
    await assert.rejects(
      () => withRetry(fn, { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 }, "execute"),
    );
    assert.strictEqual(calls, 2);
  });
});

// ── withFallback ──────────────────────────────────────────────────────────────

describe("withFallback", () => {
  test("returns primary result when primary succeeds", async () => {
    const { result, usedFallback } = await withFallback(
      async () => "primary",
      async () => "fallback",
    );
    assert.strictEqual(result, "primary");
    assert.strictEqual(usedFallback, false);
  });

  test("returns fallback result when primary throws", async () => {
    const { result, usedFallback } = await withFallback(
      async () => { throw new Error("primary down"); },
      async () => "fallback",
    );
    assert.strictEqual(result, "fallback");
    assert.strictEqual(usedFallback, true);
  });

  test("calls onFallback callback when falling back", async () => {
    let called = false;
    await withFallback(
      async () => { throw new Error("fail"); },
      async () => "b",
      () => { called = true; },
    );
    assert.ok(called);
  });
});

// ── withCircuitSkip ────────────────────────────────────────────────────────────

describe("withCircuitSkip", () => {
  test("executes fn when circuit is closed", async () => {
    const result = await withCircuitSkip(false, async () => "result");
    assert.strictEqual(result, "result");
  });

  test("returns null without calling fn when circuit is open", async () => {
    let called = false;
    const result = await withCircuitSkip(true, async () => { called = true; return "result"; });
    assert.strictEqual(result, null);
    assert.strictEqual(called, false);
  });
});

// ── Registry ──────────────────────────────────────────────────────────────────

describe("WORKSTREAM_REGISTRY", () => {
  test("has exactly 14 workstreams", () => {
    assert.strictEqual(WORKSTREAM_REGISTRY.length, 14);
  });

  test("each workstream has required fields", () => {
    for (const ws of WORKSTREAM_REGISTRY) {
      assert.ok(ws.id, `${ws.id}: missing id`);
      assert.ok(ws.name, `${ws.id}: missing name`);
      assert.ok(Array.isArray(ws.dependencies), `${ws.id}: dependencies must be array`);
      assert.ok(Array.isArray(ws.permissions), `${ws.id}: permissions must be array`);
      assert.strictEqual(typeof ws.slaMs, "number");
      assert.ok(ws.slaMs > 0, `${ws.id}: slaMs must be positive`);
      assert.ok(ws.category, `${ws.id}: missing category`);
      assert.strictEqual(typeof ws.critical, "boolean");
    }
  });

  test("getWorkstream finds by id", () => {
    const ws = getWorkstream("dispatch");
    assert.ok(ws);
    assert.strictEqual(ws?.id, "dispatch");
  });

  test("getWorkstream returns undefined for unknown id", () => {
    assert.strictEqual(getWorkstream("nonexistent-workstream-xyz"), undefined);
  });

  test("getCriticalWorkstreams returns only critical ones", () => {
    const critical = getCriticalWorkstreams();
    assert.ok(critical.length > 0);
    for (const ws of critical) {
      assert.strictEqual(ws.critical, true);
    }
  });

  test("getWorkstreamsByCategory returns items for a valid category", () => {
    // Pick a category that actually exists in the registry
    const all = WORKSTREAM_REGISTRY;
    const firstCategory = all[0].category;
    const filtered = getWorkstreamsByCategory(firstCategory);
    assert.ok(filtered.length > 0);
    for (const ws of filtered) {
      assert.strictEqual(ws.category, firstCategory);
    }
  });
});

describe("PLATFORM_DEPENDENCIES", () => {
  test("has at least 5 dependencies declared", () => {
    assert.ok(Object.keys(PLATFORM_DEPENDENCIES).length >= 5);
  });

  test("each dependency has a name and category", () => {
    for (const [key, dep] of Object.entries(PLATFORM_DEPENDENCIES)) {
      assert.ok(dep.name, `${key}: missing name`);
      assert.ok(dep.category, `${key}: missing category`);
    }
  });
});

// ── buildRootCauseAnalysis ────────────────────────────────────────────────────

describe("buildRootCauseAnalysis", () => {
  test("returns a non-empty string", () => {
    const result = buildRootCauseAnalysis(
      "dispatch",
      "load-dependencies",
      new Error("connection refused"),
      "supabase",
    );
    assert.strictEqual(typeof result, "string");
    assert.ok(result.length > 0);
  });

  test("includes workstream name", () => {
    const result = buildRootCauseAnalysis("payments", "execute", new Error("timeout"));
    assert.ok(result.toLowerCase().includes("payments"));
  });

  test("includes dependency when provided", () => {
    const result = buildRootCauseAnalysis("dispatch", "execute", new Error("fail"), "redis");
    assert.ok(result.toLowerCase().includes("redis"));
  });
});
