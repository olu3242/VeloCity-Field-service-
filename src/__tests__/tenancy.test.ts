import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getTenantId,
  getTenantIdOrDefault,
  withTenant,
  DEFAULT_TENANT_ID,
} from "../lib/tenancy";

describe("getTenantId", () => {
  test("throws TENANT_RESOLUTION_FAILED when profile has no tenant_id", () => {
    assert.throws(
      () => getTenantId({ role: "customer", tenant_id: null }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("TENANT_RESOLUTION_FAILED"),
          `Expected message to include TENANT_RESOLUTION_FAILED, got: ${err.message}`
        );
        const e = err as Error & { code?: string; statusCode?: number };
        assert.strictEqual(e.code, "TENANT_RESOLUTION_FAILED");
        assert.strictEqual(e.statusCode, 500);
        return true;
      }
    );
  });

  test("throws when profile is undefined", () => {
    assert.throws(() => getTenantId(undefined), Error);
  });

  test("throws when profile is null", () => {
    assert.throws(() => getTenantId(null), Error);
  });

  test("throws when tenant_id is empty string", () => {
    assert.throws(() => getTenantId({ tenant_id: "" }), Error);
  });

  test("returns tenant_id when present", () => {
    const result = getTenantId({ tenant_id: "abc-123" });
    assert.strictEqual(result, "abc-123");
  });

  test("returns tenant_id ignoring other fields", () => {
    const result = getTenantId({ role: "admin", tenant_id: "tenant-xyz" });
    assert.strictEqual(result, "tenant-xyz");
  });
});

describe("getTenantIdOrDefault", () => {
  test("returns DEFAULT_TENANT_ID when value is null", () => {
    const result = getTenantIdOrDefault(null, "test-context");
    assert.strictEqual(result, DEFAULT_TENANT_ID);
  });

  test("returns DEFAULT_TENANT_ID when value is undefined", () => {
    const result = getTenantIdOrDefault(undefined, "test-context");
    assert.strictEqual(result, DEFAULT_TENANT_ID);
  });

  test("returns provided value when set", () => {
    const result = getTenantIdOrDefault("my-tenant-id", "test-context");
    assert.strictEqual(result, "my-tenant-id");
  });

  test("logs a warning when falling back to default", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    try {
      getTenantIdOrDefault(null, "cron-job");
      assert.ok(
        warnings.some((w) => w.includes("TENANT_FALLBACK")),
        `Expected TENANT_FALLBACK warning, got: ${warnings.join(", ")}`
      );
      assert.ok(
        warnings.some((w) => w.includes("cron-job")),
        `Expected context name in warning, got: ${warnings.join(", ")}`
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  test("does not warn when a valid tenant id is provided", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    try {
      getTenantIdOrDefault("valid-id", "webhook");
      assert.strictEqual(warnings.length, 0, "Expected no warnings");
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("withTenant", () => {
  test("merges tenant_id into a plain object", () => {
    const result = withTenant("t-1", { name: "test", value: 42 });
    assert.deepStrictEqual(result, { name: "test", value: 42, tenant_id: "t-1" });
  });

  test("overwrites an existing tenant_id field", () => {
    const result = withTenant("new-id", { tenant_id: "old-id", x: 1 } as Record<string, unknown>);
    assert.strictEqual(result.tenant_id, "new-id");
  });

  test("works with an empty object", () => {
    const result = withTenant("t-99", {});
    assert.deepStrictEqual(result, { tenant_id: "t-99" });
  });

  test("preserves all original keys", () => {
    const input = { a: 1, b: "hello", c: true };
    const result = withTenant("t-2", input);
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, "hello");
    assert.strictEqual(result.c, true);
    assert.strictEqual(result.tenant_id, "t-2");
  });
});

describe("DEFAULT_TENANT_ID", () => {
  test("is a valid UUID string", () => {
    assert.match(
      DEFAULT_TENANT_ID,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
