// redis.test.ts — Tests for the distributed runtime layer.
// Redis client is NOT configured in CI, so all tests exercise the
// in-memory fallback paths and pure logic (no live Redis calls).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("RedisClient", () => {
  test("isConfigured returns false when env vars are absent", async () => {
    const { RedisClient } = await import("../lib/redis/client");
    const client = new RedisClient();
    // In CI, UPSTASH_REDIS_REST_URL is not set.
    const expected =
      !!process.env.UPSTASH_REDIS_REST_URL &&
      !!process.env.UPSTASH_REDIS_REST_TOKEN &&
      !String(process.env.UPSTASH_REDIS_REST_URL).includes("placeholder") &&
      !String(process.env.UPSTASH_REDIS_REST_TOKEN).includes("placeholder");
    assert.strictEqual(client.isConfigured, expected);
  });
});

describe("checkDistributedRateLimit — in-memory fallback", () => {
  test("allows requests under the limit", async () => {
    const { checkDistributedRateLimit } = await import(
      "../lib/redis/rate-limiter"
    );
    // Use a unique key so other tests don't interfere
    const key = `test:rl:allow:${Date.now()}`;
    const result = await checkDistributedRateLimit(key, 5, 60_000);
    assert.strictEqual(result.allowed, true);
    assert.ok(result.remaining >= 0);
    assert.ok(result.source === "redis" || result.source === "memory");
  });

  test("blocks requests over the limit in fallback mode", async () => {
    const { checkDistributedRateLimit } = await import(
      "../lib/redis/rate-limiter"
    );
    const key = `test:rl:block:${Date.now()}`;
    const limit = 3;
    // Consume all slots
    for (let i = 0; i < limit; i++) {
      await checkDistributedRateLimit(key, limit, 60_000);
    }
    const result = await checkDistributedRateLimit(key, limit, 60_000);
    // When using in-memory fallback, should be blocked after limit
    if (result.source === "memory") {
      assert.strictEqual(result.allowed, false);
    }
    // When using Redis, the result depends on the Lua script; we just
    // verify the shape of the response.
    assert.ok(typeof result.allowed === "boolean");
    assert.ok(typeof result.remaining === "number");
  });
});

describe("Distributed lock", () => {
  test("acquireLock returns null when Redis is not configured", async () => {
    const { acquireLock } = await import("../lib/redis/lock");
    const { RedisClient } = await import("../lib/redis/client");
    const client = new RedisClient();
    if (!client.isConfigured) {
      const lock = await acquireLock("test-resource", 5_000, "owner-1");
      assert.strictEqual(lock, null);
    }
  });

  test("releaseLock returns false when Redis is not configured", async () => {
    const { releaseLock } = await import("../lib/redis/lock");
    const { RedisClient } = await import("../lib/redis/client");
    const client = new RedisClient();
    if (!client.isConfigured) {
      const released = await releaseLock({
        resource: "test-resource",
        ownerId: "owner-1",
        ttlMs: 5_000,
        acquiredAt: Date.now(),
      });
      assert.strictEqual(released, false);
    }
  });
});

describe("Idempotency store — in-memory fallback", () => {
  test("beginIdempotent returns true for a new key", async () => {
    const { beginIdempotent } = await import("../lib/redis/idempotency");
    const key = `idem-test-new-${Date.now()}`;
    const result = await beginIdempotent("test", key);
    assert.strictEqual(result, true);
  });

  test("beginIdempotent returns false for a duplicate key", async () => {
    const { beginIdempotent } = await import("../lib/redis/idempotency");
    const key = `idem-test-dup-${Date.now()}`;
    await beginIdempotent("test", key);
    const second = await beginIdempotent("test", key);
    assert.strictEqual(second, false);
  });

  test("isAlreadyProcessed returns false for a new key", async () => {
    const { isAlreadyProcessed } = await import("../lib/redis/idempotency");
    const key = `idem-test-new-processed-${Date.now()}`;
    const result = await isAlreadyProcessed("test", key);
    assert.strictEqual(result, false);
  });

  test("isAlreadyProcessed returns true after completeIdempotent", async () => {
    const { beginIdempotent, completeIdempotent, isAlreadyProcessed } =
      await import("../lib/redis/idempotency");
    const key = `idem-test-complete-${Date.now()}`;
    await beginIdempotent("test", key);
    await completeIdempotent("test", key, "done");
    const result = await isAlreadyProcessed("test", key);
    assert.strictEqual(result, true);
  });
});

describe("Tracing — W3C traceparent", () => {
  test("generateTraceId produces a 32-char hex string", async () => {
    const { generateTraceId } = await import("../lib/tracing/span");
    const id = generateTraceId();
    assert.match(id, /^[0-9a-f]{32}$/);
  });

  test("generateSpanId produces a 16-char hex string", async () => {
    const { generateSpanId } = await import("../lib/tracing/span");
    const id = generateSpanId();
    assert.match(id, /^[0-9a-f]{16}$/);
  });

  test("encodeTraceparent produces W3C-format header", async () => {
    const { encodeTraceparent } = await import("../lib/tracing/span");
    const header = encodeTraceparent({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      sampled: true,
    });
    assert.strictEqual(
      header,
      `00-${"a".repeat(32)}-${"b".repeat(16)}-01`
    );
  });

  test("parseTraceparent roundtrips through encodeTraceparent", async () => {
    const { encodeTraceparent, parseTraceparent, rootContext } = await import(
      "../lib/tracing/span"
    );
    const ctx = rootContext();
    const header = encodeTraceparent(ctx);
    const parsed = parseTraceparent(header);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed!.traceId, ctx.traceId);
    assert.strictEqual(parsed!.spanId, ctx.spanId);
    assert.strictEqual(parsed!.sampled, ctx.sampled);
  });

  test("childContext propagates traceId from parent", async () => {
    const { childContext, encodeTraceparent, rootContext } = await import(
      "../lib/tracing/span"
    );
    const parent = rootContext();
    const parentHeader = encodeTraceparent(parent);
    const child = childContext(parentHeader);
    assert.strictEqual(child.traceId, parent.traceId);
    assert.notStrictEqual(child.spanId, parent.spanId);
    assert.strictEqual(child.parentSpanId, parent.spanId);
  });

  test("childContext creates a new root when header is null", async () => {
    const { childContext } = await import("../lib/tracing/span");
    const ctx = childContext(null);
    assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
    assert.match(ctx.spanId, /^[0-9a-f]{16}$/);
    assert.strictEqual(ctx.parentSpanId, undefined);
  });
});
