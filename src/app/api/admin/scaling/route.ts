// GET  /api/admin/scaling — quota config/usage, throttle state, retry pressure, DLQ items and stats
// POST /api/admin/scaling — set_quota | record_usage | check_quota | reset_hourly_usage
//                           | analyze_load | calculate_optimal_workers
//                           | activate_throttle | deactivate_throttle | update_retry_pressure
//                           | record_request | should_suppress_retry
//                           | add_to_dead_letter | replay_dlq_item | discard_dlq_item
// Admin-only. Quotas and DLQ items are tenant-scoped; global throttle controls require super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  setQuota,
  getQuota,
  getUsage,
  recordUsage,
  checkQuota,
  resetHourlyUsage,
  DEFAULT_QUOTAS,
  type QuotaConfig,
} from "@/lib/scaling/execution-quotas";
import {
  analyzeLoad,
  calculateOptimalWorkers,
  type LoadProfile,
} from "@/lib/scaling/load-balancer";
import {
  recordRequest,
  activateThrottle,
  deactivateThrottle,
  getThrottleState,
  updateRetryPressure,
  getRetryPressureConfig,
  shouldSuppressRetry,
  type RetryPressureConfig,
} from "@/lib/scaling/throttle-controller";
import {
  addToDeadLetter,
  replayItem,
  discardItem,
  getDLQItems,
  getDLQStats,
  type DeadLetterItem,
} from "@/lib/scaling/dead-letter-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_USAGE_TYPES = ["event", "ai_call", "ai_tokens", "workflow_start"] as const;
const VALID_QUOTA_TYPES = ["event", "ai_call", "ai_tokens", "workflow"] as const;
const VALID_DLQ_SOURCES: DeadLetterItem["source"][] = [
  "automation_queue", "delivery", "webhook", "agent_execution",
];
const VALID_DLQ_STATUSES: DeadLetterItem["status"][] = [
  "pending_review", "replaying", "resolved", "discarded",
];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// DLQ items carry an optional tenantId; only this tenant's items are actionable.
function ownsDlqItem(id: string, tenantId: string): boolean {
  return getDLQItems().some((item) => item.id === id && item.tenantId === tenantId);
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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const dlqStatus = url.searchParams.get("dlqStatus") as DeadLetterItem["status"] | null;

  const tenantDlq = getDLQItems().filter((item) => item.tenantId === tenantId);

  return NextResponse.json({
    quotas: {
      config: getQuota(tenantId),
      usage: getUsage(tenantId),
      defaults: DEFAULT_QUOTAS,
    },
    throttle: {
      state: getThrottleState(),
      retryPressure: getRetryPressureConfig(),
    },
    deadLetter: {
      // Stats are platform-wide by design; the item list stays tenant-scoped.
      items: dlqStatus && VALID_DLQ_STATUSES.includes(dlqStatus)
        ? tenantDlq.filter((item) => item.status === dlqStatus)
        : tenantDlq,
      stats: getDLQStats(),
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
  const isSuperAdmin = auth.profile.role === "super_admin";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "set_quota") {
    const { hourlyEventLimit, hourlyAICallLimit, dailyAITokenBudget, concurrentWorkflowLimit } =
      body as Record<string, unknown>;
    const existing = getQuota(tenantId);
    const config: QuotaConfig = {
      tenantId,
      hourlyEventLimit: num(hourlyEventLimit, existing.hourlyEventLimit),
      hourlyAICallLimit: num(hourlyAICallLimit, existing.hourlyAICallLimit),
      dailyAITokenBudget: num(dailyAITokenBudget, existing.dailyAITokenBudget),
      concurrentWorkflowLimit: num(concurrentWorkflowLimit, existing.concurrentWorkflowLimit),
    };
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "number" && value < 0) {
        return NextResponse.json({ error: `${key} must be non-negative` }, { status: 400 });
      }
    }
    setQuota(config);
    return NextResponse.json({ action: "set_quota", config, success: true });
  }

  if (action === "record_usage") {
    const { type, amount } = body as Record<string, unknown>;
    if (!VALID_USAGE_TYPES.includes(type as (typeof VALID_USAGE_TYPES)[number])) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_USAGE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (amount !== undefined && (typeof amount !== "number" || amount < 0)) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }
    recordUsage(
      tenantId,
      type as (typeof VALID_USAGE_TYPES)[number],
      typeof amount === "number" ? amount : undefined
    );
    return NextResponse.json({
      action: "record_usage",
      usage: getUsage(tenantId),
      success: true,
    });
  }

  if (action === "check_quota") {
    const { type } = body as Record<string, unknown>;
    if (!VALID_QUOTA_TYPES.includes(type as (typeof VALID_QUOTA_TYPES)[number])) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_QUOTA_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const verdict = checkQuota(tenantId, type as (typeof VALID_QUOTA_TYPES)[number]);
    return NextResponse.json({ action: "check_quota", type, verdict, success: true });
  }

  if (action === "reset_hourly_usage") {
    // Resets usage counters for every tenant — platform-wide, super_admin only.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — resetting hourly usage is platform-wide and requires super_admin" },
        { status: 403 }
      );
    }
    resetHourlyUsage();
    return NextResponse.json({
      action: "reset_hourly_usage",
      usage: getUsage(tenantId),
      success: true,
    });
  }

  if (action === "analyze_load") {
    const {
      queueDepth, processingRate, failureRate,
      avgLatencyMs, workerCount, aiCallsPerMinute,
    } = body as Record<string, unknown>;
    if (typeof queueDepth !== "number" || typeof processingRate !== "number") {
      return NextResponse.json(
        { error: "queueDepth and processingRate must be numbers" },
        { status: 400 }
      );
    }
    const profile: LoadProfile = {
      queueDepth,
      processingRate,
      failureRate: num(failureRate, 0),
      avgLatencyMs: num(avgLatencyMs, 0),
      workerCount: num(workerCount, 1),
      aiCallsPerMinute: num(aiCallsPerMinute, 0),
    };
    return NextResponse.json({
      action: "analyze_load",
      recommendation: analyzeLoad(profile),
      success: true,
    });
  }

  if (action === "calculate_optimal_workers") {
    const { queueDepth, targetDrainTimeS, avgProcessingMs } = body as Record<string, unknown>;
    if (typeof queueDepth !== "number") {
      return NextResponse.json({ error: "queueDepth must be a number" }, { status: 400 });
    }
    const drainTime = num(targetDrainTimeS, 60);
    const processingMs = num(avgProcessingMs, 2_000);
    if (drainTime <= 0 || processingMs <= 0) {
      return NextResponse.json(
        { error: "targetDrainTimeS and avgProcessingMs must be positive" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "calculate_optimal_workers",
      optimalWorkers: calculateOptimalWorkers(queueDepth, drainTime, processingMs),
      success: true,
    });
  }

  if (action === "activate_throttle" || action === "deactivate_throttle") {
    // Throttle state is a single global control — restrict to super_admin so one
    // tenant's admin cannot throttle the whole platform.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — throttle control is platform-wide and requires super_admin" },
        { status: 403 }
      );
    }
    if (action === "deactivate_throttle") {
      deactivateThrottle();
      return NextResponse.json({
        action: "deactivate_throttle",
        state: getThrottleState(),
        success: true,
      });
    }
    const { reason, targetRPS } = body as Record<string, unknown>;
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    if (typeof targetRPS !== "number" || targetRPS <= 0) {
      return NextResponse.json({ error: "targetRPS must be a positive number" }, { status: 400 });
    }
    activateThrottle(reason, targetRPS);
    return NextResponse.json({
      action: "activate_throttle",
      state: getThrottleState(),
      success: true,
    });
  }

  if (action === "update_retry_pressure") {
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — retry pressure is platform-wide and requires super_admin" },
        { status: 403 }
      );
    }
    const { maxRetryRate, backoffMultiplierMs, suppressLowPriority } =
      body as Record<string, unknown>;
    const updates: Partial<RetryPressureConfig> = {
      ...(typeof maxRetryRate === "number" ? { maxRetryRate } : {}),
      ...(typeof backoffMultiplierMs === "number" ? { backoffMultiplierMs } : {}),
      ...(typeof suppressLowPriority === "boolean" ? { suppressLowPriority } : {}),
    };
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "at least one of maxRetryRate, backoffMultiplierMs, suppressLowPriority required" },
        { status: 400 }
      );
    }
    updateRetryPressure(updates);
    return NextResponse.json({
      action: "update_retry_pressure",
      config: getRetryPressureConfig(),
      success: true,
    });
  }

  if (action === "record_request") {
    recordRequest();
    return NextResponse.json({
      action: "record_request",
      state: getThrottleState(),
      success: true,
    });
  }

  if (action === "should_suppress_retry") {
    const { eventPriority, currentRetryRate } = body as Record<string, unknown>;
    if (typeof eventPriority !== "number" || typeof currentRetryRate !== "number") {
      return NextResponse.json(
        { error: "eventPriority and currentRetryRate must be numbers" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "should_suppress_retry",
      suppress: shouldSuppressRetry(eventPriority, currentRetryRate),
      success: true,
    });
  }

  if (action === "add_to_dead_letter") {
    const { source, eventType, payload, failureReason, attemptCount, firstFailedAt } =
      body as Record<string, unknown>;
    if (!VALID_DLQ_SOURCES.includes(source as DeadLetterItem["source"])) {
      return NextResponse.json(
        { error: `source must be one of: ${VALID_DLQ_SOURCES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (typeof failureReason !== "string" || failureReason.trim() === "") {
      return NextResponse.json({ error: "failureReason required" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const item = addToDeadLetter({
      source: source as DeadLetterItem["source"],
      eventType,
      payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      failureReason,
      attemptCount: num(attemptCount, 1),
      firstFailedAt: typeof firstFailedAt === "string" ? firstFailedAt : now,
      lastFailedAt: now,
      tenantId,
    });
    return NextResponse.json({ action: "add_to_dead_letter", item, success: true }, { status: 201 });
  }

  if (action === "replay_dlq_item" || action === "discard_dlq_item") {
    const { id, reason } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!ownsDlqItem(id, tenantId)) {
      return NextResponse.json(
        { error: "Dead-letter item not found for this tenant" },
        { status: 404 }
      );
    }

    if (action === "discard_dlq_item") {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required to discard" }, { status: 400 });
      }
      discardItem(id, reason);
      return NextResponse.json({
        action: "discard_dlq_item",
        id,
        stats: getDLQStats(),
        success: true,
      });
    }

    const result = await replayItem(id);
    // A failed replay leaves the item pending review — report it as a conflict, not a success.
    return NextResponse.json(
      { action: "replay_dlq_item", id, result, stats: getDLQStats(), success: result.replayed },
      { status: result.replayed ? 200 : 409 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'set_quota', 'record_usage', 'check_quota', 'reset_hourly_usage', 'analyze_load', 'calculate_optimal_workers', 'activate_throttle', 'deactivate_throttle', 'update_retry_pressure', 'record_request', 'should_suppress_retry', 'add_to_dead_letter', 'replay_dlq_item', or 'discard_dlq_item'.`,
    },
    { status: 400 }
  );
}
