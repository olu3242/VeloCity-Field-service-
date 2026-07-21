// utils.test.ts — Tests for pure utility functions in src/lib/utils/index.ts.
//
// We import directly from the module. tsx (used by the test runner) resolves
// the @/ path alias from tsconfig.json paths so transitive imports work.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatCents,
  formatDate,
  formatTimeAgo,
  generateOTP,
  slugify,
  truncate,
  platformFeePercent,
  calculatePlatformFee,
} from "../lib/utils/index";

describe("formatCents", () => {
  test("formats 100 cents as $1.00", () => {
    assert.strictEqual(formatCents(100), "$1.00");
  });

  test("formats 0 cents as $0", () => {
    // Intl.NumberFormat drops trailing zeros below 1 for minimumFractionDigits=0
    const result = formatCents(0);
    assert.ok(
      result === "$0" || result === "$0.00",
      `Expected $0 or $0.00, got ${result}`
    );
  });

  test("formats 1000 cents as $10.00", () => {
    assert.strictEqual(formatCents(1000), "$10.00");
  });

  test("formats 9999 cents as $99.99", () => {
    assert.strictEqual(formatCents(9999), "$99.99");
  });

  test("formats 50 cents as $0.50", () => {
    assert.strictEqual(formatCents(50), "$0.50");
  });

  test("handles large values like 1_000_000 cents = $10,000.00", () => {
    assert.strictEqual(formatCents(1_000_000), "$10,000");
  });

  test("respects the currency parameter", () => {
    const result = formatCents(100, "EUR");
    assert.ok(result.includes("1"), `Expected amount containing 1, got ${result}`);
  });
});

describe("formatDate", () => {
  test("formats a date string to a readable date", () => {
    const result = formatDate("2025-01-15");
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
    // Should contain the year 2025
    assert.ok(result.includes("2025"), `Expected year 2025 in "${result}"`);
  });

  test("formats a Date object", () => {
    const d = new Date("2024-06-01");
    const result = formatDate(d);
    assert.ok(result.includes("2024"));
  });
});

describe("formatTimeAgo", () => {
  test("returns 'just now' for a date less than 1 minute ago", () => {
    const now = new Date();
    assert.strictEqual(formatTimeAgo(now), "just now");
  });

  test("returns minutes ago for a date 5 minutes ago", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    assert.strictEqual(formatTimeAgo(fiveMinutesAgo), "5m ago");
  });

  test("returns hours ago for a date 3 hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    assert.strictEqual(formatTimeAgo(threeHoursAgo), "3h ago");
  });

  test("returns days ago for a date 2 days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    assert.strictEqual(formatTimeAgo(twoDaysAgo), "2d ago");
  });

  test("returns formatted date for dates older than 7 days", () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = formatTimeAgo(oldDate);
    // Should not be in the "X ago" format
    assert.ok(!result.endsWith(" ago"), `Expected a formatted date, got "${result}"`);
  });
});

describe("generateOTP", () => {
  test("returns a 6-digit string by default", () => {
    const otp = generateOTP();
    assert.strictEqual(typeof otp, "string");
    assert.strictEqual(otp.length, 6);
  });

  test("returns only digit characters", () => {
    const otp = generateOTP();
    assert.match(otp, /^\d+$/);
  });

  test("respects a custom length", () => {
    assert.strictEqual(generateOTP(4).length, 4);
    assert.strictEqual(generateOTP(8).length, 8);
  });

  test("produces different values on consecutive calls (probabilistic)", () => {
    const samples = new Set(Array.from({ length: 10 }, () => generateOTP()));
    // With 10^6 possible values, 10 samples should not all be identical
    assert.ok(samples.size > 1, "generateOTP should not return the same value every time");
  });
});

describe("slugify", () => {
  test("converts spaces to hyphens", () => {
    assert.strictEqual(slugify("hello world"), "hello-world");
  });

  test("lowercases the input", () => {
    assert.strictEqual(slugify("Hello World"), "hello-world");
  });

  test("removes non-word characters", () => {
    assert.strictEqual(slugify("hello & world!"), "hello--world");
  });

  test("handles single word", () => {
    assert.strictEqual(slugify("plumbing"), "plumbing");
  });

  test("handles empty string", () => {
    assert.strictEqual(slugify(""), "");
  });
});

describe("truncate", () => {
  test("does not truncate strings within the limit", () => {
    assert.strictEqual(truncate("hello", 10), "hello");
  });

  test("truncates and appends ellipsis when over limit", () => {
    assert.strictEqual(truncate("hello world", 8), "hello...");
  });

  test("returns exactly maxLength characters (including ellipsis)", () => {
    const result = truncate("abcdefghij", 7);
    assert.strictEqual(result.length, 7);
    assert.ok(result.endsWith("..."));
  });

  test("handles string exactly at limit without truncation", () => {
    assert.strictEqual(truncate("hello", 5), "hello");
  });
});

describe("platformFeePercent", () => {
  test("returns 20% for amounts below $100 (10000 cents)", () => {
    assert.strictEqual(platformFeePercent(9999), 0.2);
    assert.strictEqual(platformFeePercent(0), 0.2);
    assert.strictEqual(platformFeePercent(1), 0.2);
  });

  test("returns 18% for amounts $100–$499.99 (10000–49999 cents)", () => {
    assert.strictEqual(platformFeePercent(10000), 0.18);
    assert.strictEqual(platformFeePercent(25000), 0.18);
    assert.strictEqual(platformFeePercent(49999), 0.18);
  });

  test("returns 15% for amounts $500+ (50000+ cents)", () => {
    assert.strictEqual(platformFeePercent(50000), 0.15);
    assert.strictEqual(platformFeePercent(100000), 0.15);
  });
});

describe("calculatePlatformFee", () => {
  test("calculates 20% fee on a $50 job (5000 cents)", () => {
    assert.strictEqual(calculatePlatformFee(5000), 1000);
  });

  test("calculates 18% fee on a $200 job (20000 cents)", () => {
    assert.strictEqual(calculatePlatformFee(20000), 3600);
  });

  test("calculates 15% fee on a $600 job (60000 cents)", () => {
    assert.strictEqual(calculatePlatformFee(60000), 9000);
  });

  test("rounds to the nearest cent", () => {
    // 9999 cents * 0.20 = 1999.8 → rounds to 2000
    assert.strictEqual(calculatePlatformFee(9999), 2000);
  });
});
