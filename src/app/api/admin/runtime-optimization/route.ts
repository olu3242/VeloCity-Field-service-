// GET  /api/admin/runtime-optimization — dedup stats, execution paths, pending batches, retry schedule
// POST /api/admin/runtime-optimization — check_duplicate | register_key | check_and_register | evict_expired
//                                        | register_path | record_path_execution | get_optimal_path
//                                        | add_to_batch | flush_batch | flush_stale_batches
//                                        | should_retry | retry_schedule
// Admin-only; tenant-scoped. Runtime efficiency controls — idempotency keys, execution path
// selection, event batching, and retry backoff.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  isDuplicate,
  registerKey,
  checkAndRegister,
  evictExpired,
  getStats,
} from "@/lib/runtime-optimization/deduplication";
import {
  registerPath,
  recordPathExecution,
  getOptimalPath,
  getAllPaths,
  type ExecutionPath,
} from "@/lib/runtime-optimization/path-optimizer";
import {
  addToBatch,
  flushBatch,
  flushStaleBatches,
  getPendingBatches,
  getBatchStats,
} from "@/lib/runtime-optimization/queue-batching";
import {
  shouldRetry,
  getRetrySchedule,
  type RetryConfig,
} from "@/lib/runtime-optimization/retry-timing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Dedup and batch keys live in process-global maps shared by every tenant, so all
// caller-supplied keys are namespaced by tenant to prevent cross-tenant collision
// (one tenant suppressing another's event by registering the same raw key).
function scopedKey(tenantId: string, key: string): string {
  return `${tenantId}::${key}`;
}

function parseRetryConfig(raw: unknown): Partial<RetryConfig> {
  if (!raw || typeof raw !== "object") return {};
  const c = raw as Record<string, unknown>;
  return {
    ...(typeof c.baseDelayMs === "number" ? { baseDelayMs: c.baseDelayMs } : {}),
    ...(typeof c.maxDelayMs === "number" ? { maxDelayMs: c.maxDelayMs } : {}),
    ...(typeof c.multiplier === "number" ? { multiplier: c.multiplier } : {}),
    ...(typeof c.jitterFactor === "number" ? { jitterFactor: c.jitterFactor } : {}),
    ...(typeof c.maxRetries === "number" ? { maxRetries: c.maxRetries } : {}),
  };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType");
  const maxAttempts = Math.min(parseInt(url.searchParams.get("maxAttempts") ?? "5", 10), 20);

  return NextResponse.json({
    deduplication: {
      stats: getStats(),
    },
    paths: {
      all: getAllPaths(),
      ...(eventType ? { optimal: getOptimalPath(eventType) ?? null } : {}),
    },
    batching: {
      pending: getPendingBatches(),
      stats: getBatchStats(),
    },
    retry: {
      schedule: getRetrySchedule(Number.isNaN(maxAttempts) ? 5 : maxAttempts),
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Deduplication ───────────────────────────────────────────────────────

  if (action === "check_duplicate" || action === "register_key" || action === "check_and_register") {
    const { key, ttlMs } = raw;
    if (typeof key !== "string" || key.trim() === "") {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    if (ttlMs !== undefined && (typeof ttlMs !== "number" || ttlMs <= 0)) {
      return NextResponse.json({ error: "ttlMs must be a positive number" }, { status: 400 });
    }
    const namespaced = scopedKey(tenantId, key);
    const ttl = typeof ttlMs === "number" ? ttlMs : undefined;

    if (action === "check_duplicate") {
      return NextResponse.json({
        action: "check_duplicate",
        key,
        duplicate: isDuplicate(namespaced, ttl),
        success: true,
      });
    }
    if (action === "register_key") {
      registerKey(namespaced, ttl);
      return NextResponse.json({ action: "register_key", key, stats: getStats(), success: true }, { status: 201 });
    }
    return NextResponse.json({
      action: "check_and_register",
      key,
      // true means it was already seen — the caller should skip processing.
      duplicate: checkAndRegister(namespaced, ttl),
      stats: getStats(),
      success: true,
    });
  }

  if (action === "evict_expired") {
    const evicted = evictExpired();
    return NextResponse.json({ action: "evict_expired", evicted, stats: getStats(), success: true });
  }

  // ── Path optimizer ──────────────────────────────────────────────────────

  if (action === "register_path") {
    const { pathId, eventType, steps, avgDurationMs, successRate, costUsd } = raw;
    if (typeof pathId !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ error: "pathId and eventType required" }, { status: 400 });
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "steps must be a non-empty array" }, { status: 400 });
    }
    if (successRate !== undefined && (typeof successRate !== "number" || successRate < 0 || successRate > 1)) {
      return NextResponse.json({ error: "successRate must be between 0 and 1" }, { status: 400 });
    }
    const path: ExecutionPath = {
      pathId,
      eventType,
      steps: steps as string[],
      avgDurationMs: num(avgDurationMs, 0),
      successRate: typeof successRate === "number" ? successRate : 1,
      costUsd: num(costUsd, 0),
      lastUsedAt: new Date().toISOString(),
    };
    registerPath(path);
    return NextResponse.json({ action: "register_path", path, success: true }, { status: 201 });
  }

  if (action === "record_path_execution") {
    const { pathId, eventType, durationMs, success: execSucceeded, costUsd } = raw;
    if (typeof pathId !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ error: "pathId and eventType required" }, { status: 400 });
    }
    if (typeof execSucceeded !== "boolean") {
      return NextResponse.json({ error: "success must be a boolean" }, { status: 400 });
    }
    // recordPathExecution silently no-ops on an unknown path — verify first so a
    // typo'd pathId is reported rather than swallowed.
    if (!getAllPaths().some((p) => p.pathId === pathId && p.eventType === eventType)) {
      return NextResponse.json(
        { error: `No registered path '${pathId}' for eventType '${eventType}'` },
        { status: 404 }
      );
    }
    recordPathExecution(pathId, eventType, num(durationMs, 0), execSucceeded, num(costUsd, 0));
    return NextResponse.json({
      action: "record_path_execution",
      optimal: getOptimalPath(eventType) ?? null,
      success: true,
    });
  }

  if (action === "get_optimal_path") {
    const { eventType } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const recommendation = getOptimalPath(eventType);
    if (!recommendation) {
      return NextResponse.json(
        { error: `No paths registered for eventType: ${eventType}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ action: "get_optimal_path", recommendation, success: true });
  }

  // ── Queue batching ──────────────────────────────────────────────────────

  if (action === "add_to_batch") {
    const { eventType, eventId, payload } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (typeof eventId !== "string" || eventId.trim() === "") {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }
    // Batches key on eventType alone, so scoping keeps one tenant's events out of
    // another's batch — batched items are flushed together downstream.
    const batch = addToBatch(
      scopedKey(tenantId, eventType),
      eventId,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "add_to_batch", batch, success: true }, { status: 201 });
  }

  if (action === "flush_batch") {
    const { eventType } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const batch = flushBatch(scopedKey(tenantId, eventType));
    if (!batch) {
      return NextResponse.json(
        { error: `No pending batch for eventType: ${eventType}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ action: "flush_batch", batch, stats: getBatchStats(), success: true });
  }

  if (action === "flush_stale_batches") {
    const flushed = flushStaleBatches();
    return NextResponse.json({
      action: "flush_stale_batches",
      flushed,
      stats: getBatchStats(),
      success: true,
    });
  }

  // ── Retry timing ────────────────────────────────────────────────────────

  if (action === "should_retry") {
    const { attempt, error: errorText, config } = raw;
    if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 0) {
      return NextResponse.json({ error: "attempt must be a non-negative integer" }, { status: 400 });
    }
    if (typeof errorText !== "string") {
      return NextResponse.json({ error: "error string required" }, { status: 400 });
    }
    const decision = shouldRetry(attempt, errorText, parseRetryConfig(config));
    return NextResponse.json({ action: "should_retry", decision, success: true });
  }

  if (action === "retry_schedule") {
    const { maxAttempts, config } = raw;
    if (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts <= 0) {
      return NextResponse.json({ error: "maxAttempts must be a positive integer" }, { status: 400 });
    }
    const schedule = getRetrySchedule(Math.min(maxAttempts, 20), parseRetryConfig(config));
    return NextResponse.json({ action: "retry_schedule", schedule, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'check_duplicate', 'register_key', 'check_and_register', 'evict_expired', 'register_path', 'record_path_execution', 'get_optimal_path', 'add_to_batch', 'flush_batch', 'flush_stale_batches', 'should_retry', or 'retry_schedule'.`,
    },
    { status: 400 }
  );
}
