// Workstream Execution Fabric — unit tests
// Tests pure logic only: graph engine, DAG execution, recovery strategies.
// Modules that transitively import env or Supabase are excluded from unit tests
// (those paths are covered by integration tests and the Command Center live view).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildGraph,
  singleNodeGraph,
  executeGraph,
  validateDAG,
  computeGraphStats,
} from "../lib/execution/graph";
import { recoverExecution } from "../lib/execution/recovery";
import { generateRequestId } from "../lib/tracing/span";
import type { ExecutionContext, WEFEventType } from "../lib/execution/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    executionId: generateRequestId(),
    correlationId: generateRequestId(),
    traceId: generateRequestId(),
    tenantId: "tenant-1",
    franchiseId: null,
    actor: { id: "user-1", role: "admin", tenantId: "tenant-1", franchiseId: null, source: "user" },
    workstream: "dispatch",
    workflow: "provider-assignment",
    intent: "assign provider to job",
    runtimeState: {},
    dependencies: [],
    policyDecision: { allowed: true, reason: "ok", appliedRules: [], requiresSimulation: false, simulationThreshold: 0.75 },
    telemetry: {
      spans: [],
      totalDurationMs: 0,
      successRate: 1,
      retryCount: 0,
      dependencyLatencies: {},
    },
    audit: [],
    startedAt: new Date().toISOString(),
    status: "running",
    ...overrides,
  };
}

// ── buildGraph ────────────────────────────────────────────────────────────────

describe("buildGraph", () => {
  test("creates nodes and edges from step definitions", () => {
    const g = buildGraph([
      { id: "a", name: "Step A", workstream: "dispatch" },
      { id: "b", name: "Step B", workstream: "dispatch", dependsOn: ["a"] },
      { id: "c", name: "Step C", workstream: "dispatch", dependsOn: ["a"] },
    ]);
    assert.strictEqual(g.nodes.length, 3);
    assert.strictEqual(g.edges.length, 2);
    assert.ok(g.id);
    assert.ok(g.generatedAt);
  });

  test("all nodes start as pending", () => {
    const g = buildGraph([{ id: "x", name: "X", workstream: "ws" }]);
    assert.strictEqual(g.nodes[0].status, "pending");
  });

  test("nodes have correct dependency arrays", () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
    ]);
    const b = g.nodes.find((n) => n.id === "b")!;
    assert.deepStrictEqual(b.dependencies, ["a"]);
  });

  test("computes critical path — longer chain wins", () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
      { id: "c", name: "C", workstream: "ws", dependsOn: ["b"] },
      { id: "d", name: "D", workstream: "ws", dependsOn: ["a"] },
    ]);
    // Critical path: a → b → c (length 3) vs a → d (length 2)
    assert.ok(g.criticalPath.includes("a"));
    assert.ok(g.criticalPath.includes("c"));
    assert.ok(!g.criticalPath.includes("d"));
  });

  test("independent nodes produce no edges", () => {
    const g = buildGraph([
      { id: "x", name: "X", workstream: "ws" },
      { id: "y", name: "Y", workstream: "ws" },
    ]);
    assert.strictEqual(g.edges.length, 0);
  });
});

// ── singleNodeGraph ───────────────────────────────────────────────────────────

describe("singleNodeGraph", () => {
  test("produces exactly one node with no dependencies", () => {
    const g = singleNodeGraph("dispatch", "provider-assignment");
    assert.strictEqual(g.nodes.length, 1);
    assert.strictEqual(g.edges.length, 0);
    assert.deepStrictEqual(g.nodes[0].dependencies, []);
  });

  test("node id includes workstream and workflow", () => {
    const g = singleNodeGraph("payments", "invoice-generate");
    assert.ok(g.nodes[0].id.includes("payments"));
    assert.ok(g.nodes[0].id.includes("invoice-generate"));
  });
});

// ── validateDAG ───────────────────────────────────────────────────────────────

describe("validateDAG", () => {
  test("valid linear DAG passes", () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
    ]);
    assert.strictEqual(validateDAG(g).valid, true);
  });

  test("valid diamond DAG passes", () => {
    const g = buildGraph([
      { id: "root", name: "Root", workstream: "ws" },
      { id: "left", name: "Left", workstream: "ws", dependsOn: ["root"] },
      { id: "right", name: "Right", workstream: "ws", dependsOn: ["root"] },
      { id: "merge", name: "Merge", workstream: "ws", dependsOn: ["left", "right"] },
    ]);
    assert.strictEqual(validateDAG(g).valid, true);
  });

  test("detects missing dependency reference", () => {
    const g = buildGraph([
      { id: "b", name: "B", workstream: "ws", dependsOn: ["nonexistent"] },
    ]);
    const result = validateDAG(g);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes("nonexistent"));
  });

  test("valid single-node graph passes", () => {
    const g = singleNodeGraph("dispatch", "test");
    assert.strictEqual(validateDAG(g).valid, true);
  });
});

// ── executeGraph ──────────────────────────────────────────────────────────────

describe("executeGraph", () => {
  test("runs a single-node graph to completion", async () => {
    const g = singleNodeGraph("dispatch", "test-workflow");
    const completed = await executeGraph(g, async () => ({ done: true }));
    assert.strictEqual(completed.nodes[0].status, "completed");
    assert.ok(completed.nodes[0].output);
  });

  test("executes linear chain in dependency order", async () => {
    const order: string[] = [];
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
      { id: "c", name: "C", workstream: "ws", dependsOn: ["b"] },
    ]);

    await executeGraph(g, async (node) => { order.push(node.id); });

    assert.ok(order.indexOf("a") < order.indexOf("b"), "a must run before b");
    assert.ok(order.indexOf("b") < order.indexOf("c"), "b must run before c");
  });

  test("parallel branches both execute", async () => {
    const executed: string[] = [];
    const g = buildGraph([
      { id: "root", name: "Root", workstream: "ws" },
      { id: "left", name: "Left", workstream: "ws", dependsOn: ["root"] },
      { id: "right", name: "Right", workstream: "ws", dependsOn: ["root"] },
    ]);

    const result = await executeGraph(g, async (node) => { executed.push(node.id); });

    assert.ok(executed.includes("left"), "left branch must execute");
    assert.ok(executed.includes("right"), "right branch must execute");
    assert.strictEqual(result.nodes.filter((n) => n.status === "completed").length, 3);
  });

  test("skips downstream nodes when dependency fails", async () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
      { id: "c", name: "C", workstream: "ws", dependsOn: ["b"] },
    ]);
    g.nodes[0].maxRetries = 0;

    const result = await executeGraph(g, async (node) => {
      if (node.id === "a") throw new Error("a failed");
    });

    const [a, b, c] = ["a", "b", "c"].map((id) => result.nodes.find((n) => n.id === id)!);
    assert.strictEqual(a.status, "failed");
    assert.strictEqual(b.status, "skipped");
    assert.strictEqual(c.status, "skipped");
  });

  test("continues unaffected branches when one branch fails", async () => {
    const g = buildGraph([
      { id: "root", name: "Root", workstream: "ws" },
      { id: "fail", name: "Fail", workstream: "ws", dependsOn: ["root"] },
      { id: "ok", name: "Ok", workstream: "ws", dependsOn: ["root"] },
    ]);
    g.nodes.find((n) => n.id === "fail")!.maxRetries = 0;

    const result = await executeGraph(g, async (node) => {
      if (node.id === "fail") throw new Error("fail branch down");
    });

    const okNode = result.nodes.find((n) => n.id === "ok")!;
    assert.strictEqual(okNode.status, "completed");
  });

  test("retries a failing node and succeeds on 3rd attempt", async () => {
    let calls = 0;
    const g = singleNodeGraph("dispatch", "retry-test");
    g.nodes[0].maxRetries = 3;

    const result = await executeGraph(g, async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    });

    assert.strictEqual(calls, 3);
    assert.strictEqual(result.nodes[0].status, "completed");
  });

  test("fails permanently after maxRetries exhausted", async () => {
    const g = singleNodeGraph("dispatch", "fail-test");
    g.nodes[0].maxRetries = 1;

    const result = await executeGraph(g, async () => {
      throw new Error("always fails");
    });

    assert.strictEqual(result.nodes[0].status, "failed");
    assert.ok(result.nodes[0].error?.includes("always fails"));
    assert.strictEqual(result.nodes[0].retryCount, 2); // 1 initial + 1 retry
  });

  test("captures node output", async () => {
    const g = singleNodeGraph("payments", "invoice");
    const result = await executeGraph(g, async () => ({ invoiceId: "inv_123" }));
    assert.deepStrictEqual(result.nodes[0].output, { invoiceId: "inv_123" });
  });

  test("records timing on completed nodes", async () => {
    const g = singleNodeGraph("dispatch", "timed");
    const result = await executeGraph(g, async () => "done");
    const node = result.nodes[0];
    assert.ok(node.startedAt);
    assert.ok(node.completedAt);
    assert.ok(typeof node.durationMs === "number" && node.durationMs >= 0);
  });
});

// ── computeGraphStats ─────────────────────────────────────────────────────────

describe("computeGraphStats", () => {
  test("all completed — 100% success rate", async () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
    ]);
    const result = await executeGraph(g, async () => "ok");
    const stats = computeGraphStats(result);
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.completed, 2);
    assert.strictEqual(stats.failed, 0);
    assert.strictEqual(stats.successRate, 1);
  });

  test("one failure — downstream skipped", async () => {
    const g = buildGraph([
      { id: "a", name: "A", workstream: "ws" },
      { id: "b", name: "B", workstream: "ws", dependsOn: ["a"] },
    ]);
    g.nodes[0].maxRetries = 0;
    const result = await executeGraph(g, async (n) => {
      if (n.id === "a") throw new Error("fail");
    });
    const stats = computeGraphStats(result);
    assert.strictEqual(stats.failed, 1);
    assert.strictEqual(stats.skipped, 1);
    assert.strictEqual(stats.successRate, 0);
  });
});

// ── recoverExecution ──────────────────────────────────────────────────────────

describe("recoverExecution", () => {
  test("retries on network timeout (first attempt)", async () => {
    const ctx = makeCtx({ telemetry: { spans: [], totalDurationMs: 0, successRate: 1, retryCount: 0, dependencyLatencies: {} } });
    const result = await recoverExecution(ctx, new Error("network timeout"));
    assert.strictEqual(result.strategy, "retry");
    assert.strictEqual(result.recovered, true);
    assert.strictEqual(result.degraded, false);
  });

  test("retries on ECONNREFUSED (first attempt)", async () => {
    const ctx = makeCtx();
    const result = await recoverExecution(ctx, new Error("ECONNREFUSED"));
    assert.strictEqual(result.strategy, "retry");
  });

  test("degrades after max retries on network error", async () => {
    const ctx = makeCtx({ telemetry: { spans: [], totalDurationMs: 0, successRate: 1, retryCount: 3, dependencyLatencies: {} } });
    const result = await recoverExecution(ctx, new Error("network unavailable"));
    assert.strictEqual(result.degraded, true);
  });

  test("aborts immediately on Unauthorized", async () => {
    const ctx = makeCtx();
    const result = await recoverExecution(ctx, new Error("Unauthorized"));
    assert.strictEqual(result.strategy, "abort");
    assert.strictEqual(result.recovered, false);
  });

  test("aborts immediately on Forbidden", async () => {
    const ctx = makeCtx();
    const result = await recoverExecution(ctx, new Error("Forbidden"));
    assert.strictEqual(result.strategy, "abort");
  });

  test("degrades on business logic errors", async () => {
    const ctx = makeCtx();
    const result = await recoverExecution(ctx, new Error("validation failed: missing required field"));
    assert.strictEqual(result.strategy, "degrade");
    assert.strictEqual(result.degraded, true);
  });
});

// ── WEF event type registry ───────────────────────────────────────────────────

describe("WEFEventType coverage", () => {
  test("all 20 event types are valid strings", () => {
    const types: WEFEventType[] = [
      "execution.started",
      "execution.planning",
      "execution.graph.generated",
      "execution.node.started",
      "execution.node.completed",
      "execution.node.failed",
      "execution.node.retried",
      "execution.node.skipped",
      "execution.recovered",
      "execution.completed",
      "execution.failed",
      "execution.degraded",
      "ai.plan.requested",
      "ai.plan.completed",
      "knowledge.retrieved",
      "simulation.run",
      "simulation.passed",
      "simulation.blocked",
      "policy.evaluated",
      "learning.cycle.completed",
    ];
    assert.strictEqual(types.length, 20);
    for (const t of types) assert.strictEqual(typeof t, "string");
  });
});
