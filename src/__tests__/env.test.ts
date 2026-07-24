// env.test.ts — Tests for src/env.ts validation logic.
//
// The env module validates at import time (module-level side effect). These
// tests are designed to run under the CI environment where all required vars
// are provided via the `env:` block in ci.yml. Tests that verify failure paths
// test the underlying zod schema pattern directly without re-importing the
// module (Node.js ESM caches modules, so re-import with different process.env
// values is not possible without a subprocess).

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// Ensure required env vars are set before importing the env module.
// In CI these arrive via the ci.yml env: block.
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
] as const;

describe("Environment validation — required vars", () => {
  test("all required env vars are present in this test process", () => {
    const missing = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
    assert.deepStrictEqual(
      missing,
      [],
      `Missing required env vars: ${missing.join(", ")}. ` +
        "These must be set before running tests (see ci.yml env: block)."
    );
  });

  test("NODE_ENV is 'test' in the CI test environment", () => {
    assert.strictEqual(
      process.env.NODE_ENV,
      "test",
      "NODE_ENV should be 'test' when running the test suite"
    );
  });
});

describe("validateEnv — error message format", () => {
  // Test the same schema pattern used in src/env.ts to verify that the
  // error messages are helpful and include the field name.
  const stripeKeySchema = z.object({
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  });

  test("zod schema produces a helpful message when STRIPE_SECRET_KEY is empty", () => {
    // Pass empty string to trigger the min(1) custom message (not invalid_type "Required")
    const result = stripeKeySchema.safeParse({ STRIPE_SECRET_KEY: "" });
    assert.strictEqual(result.success, false);
    const issue = result.error.issues[0];
    assert.ok(
      issue.message.includes("STRIPE_SECRET_KEY"),
      `Issue message should mention the field name, got: "${issue.message}"`
    );
  });

  test("zod schema passes when STRIPE_SECRET_KEY is provided", () => {
    const result = stripeKeySchema.safeParse({ STRIPE_SECRET_KEY: "sk_test_abc123" });
    assert.strictEqual(result.success, true);
  });
});

describe("isFeatureConfigured", () => {
  // isFeatureConfigured reads from the already-validated `env` singleton.
  // We import the module here; it will use the env vars set above.
  let isFeatureConfigured: (
    feature: "twilio" | "sendgrid" | "google-maps" | "google-oauth" | "redis"
  ) => boolean;

  before(async () => {
    const mod = await import("../env");
    isFeatureConfigured = mod.isFeatureConfigured;
  });

  test("returns false for 'twilio' when TWILIO vars are absent", () => {
    // CI does not set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER
    const result = isFeatureConfigured("twilio");
    assert.strictEqual(
      result,
      false,
      "Expected isFeatureConfigured('twilio') = false when twilio vars are not set"
    );
  });

  test("returns false for 'sendgrid' when SENDGRID_API_KEY is absent", () => {
    const result = isFeatureConfigured("sendgrid");
    assert.strictEqual(result, false);
  });

  test("returns false for 'google-maps' when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is absent", () => {
    const result = isFeatureConfigured("google-maps");
    assert.strictEqual(result, false);
  });

  test("returns false for 'google-oauth' when GOOGLE_OAUTH vars are absent", () => {
    const result = isFeatureConfigured("google-oauth");
    assert.strictEqual(result, false);
  });

  test("returns false for 'redis' when UPSTASH_REDIS vars are absent", () => {
    const result = isFeatureConfigured("redis");
    assert.strictEqual(result, false);
  });
});

describe("env object shape", () => {
  let env: Record<string, unknown>;

  before(async () => {
    const mod = await import("../env");
    env = mod.env as unknown as Record<string, unknown>;
  });

  test("env.NODE_ENV is 'test'", () => {
    assert.strictEqual(env.NODE_ENV, "test");
  });

  test("env.STRIPE_SECRET_KEY is a non-empty string", () => {
    assert.strictEqual(typeof env.STRIPE_SECRET_KEY, "string");
    assert.ok((env.STRIPE_SECRET_KEY as string).length > 0);
  });

  test("env.NEXT_PUBLIC_SUPABASE_URL is a non-empty string", () => {
    assert.strictEqual(typeof env.NEXT_PUBLIC_SUPABASE_URL, "string");
    assert.ok((env.NEXT_PUBLIC_SUPABASE_URL as string).length > 0);
  });

  test("env.CRON_SECRET is a non-empty string", () => {
    assert.strictEqual(typeof env.CRON_SECRET, "string");
    assert.ok((env.CRON_SECRET as string).length > 0);
  });
});
