// GET  /api/admin/tenant-ops — health snapshot/trend, automation controls, throttle state,
//                              isolation config/violations, runtime summary
// POST /api/admin/tenant-ops — score_health | set_control | disable_event_type | enable_event_type
//                              | pause_automation | check_event_allowed | check_throttle
//                              | set_isolation_config | check_isolation_bounds
//                              | record_metrics | compare_tenants
// Admin-only. Every operation is scoped to the caller's own tenant; cross-tenant reads
// (unhealthy tenants, top-cost tenants, comparisons) are restricted to super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreTenantHealth,
  getHealthHistory,
  getHealthTrend,
  getUnhealthyTenants,
} from "@/lib/tenant-ops/health-scorer";
import {
  getControl,
  setControl,
  disableEventType,
  enableEventType,
  pauseTenantAutomation,
  isEventAllowed,
  type TenantAutomationControl,
} from "@/lib/tenant-ops/automation-controls";
import {
  getOrCreateThrottle,
  checkAndRecordEvent,
  checkAndRecordAICall,
  getThrottledTenants,
} from "@/lib/tenant-ops/throttle-manager";
import {
  setIsolationConfig,
  getIsolationConfig,
  checkIsolationBounds,
  recordViolation,
  getViolations,
  type IsolationConfig,
  type IsolationViolation,
} from "@/lib/tenant-ops/workload-isolation";
import {
  recordTenantMetrics,
  getTenantSummary,
  getTopCostTenants,
  getTenantComparison,
} from "@/lib/tenant-ops/runtime-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PRIORITY_LEVELS: IsolationConfig["priorityLevel"][] = [
  "standard", "elevated", "priority",
];
const VALID_ISOLATION_VIOLATIONS: IsolationViolation["violationType"][] = [
  "queue_overflow", "concurrency_exceeded", "resource_bleed",
];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Rates default to the tenant's existing throttle window so a caller
// omitting them cannot silently widen their own limits.
function resolveRates(
  tenantId: string,
  rawEventRate: unknown,
  rawAiRate: unknown
): { eventRate: number; aiRate: number } {
  const existing = getOrCreateThrottle(tenantId, 600, 120);
  return {
    eventRate: num(rawEventRate, existing.eventRatePerMin),
    aiRate: num(rawAiRate, existing.aiCallRatePerMin),
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

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType");
  const threshold = parseInt(url.searchParams.get("threshold") ?? "70", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  return NextResponse.json({
    health: {
      history: getHealthHistory(tenantId),
      trend: getHealthTrend(tenantId),
      // Cross-tenant health is a platform-wide view — super_admin only.
      ...(isSuperAdmin
        ? { unhealthyTenants: getUnhealthyTenants(Number.isNaN(threshold) ? 70 : threshold) }
        : {}),
    },
    automation: {
      control: getControl(tenantId),
      ...(eventType ? { eventAllowed: isEventAllowed(tenantId, eventType) } : {}),
    },
    throttle: {
      state: getOrCreateThrottle(tenantId, 600, 120),
      ...(isSuperAdmin ? { throttledTenants: getThrottledTenants() } : {}),
    },
    isolation: {
      config: getIsolationConfig(tenantId),
      violations: getViolations(tenantId),
    },
    analytics: {
      summary: getTenantSummary(tenantId) ?? null,
      ...(isSuperAdmin ? { topCostTenants: getTopCostTenants(limit) } : {}),
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

  if (action === "score_health") {
    const { automationRate, paymentSuccessRate, slaComplianceRate, workflowSuccessRate } =
      body as Record<string, unknown>;
    const rates = { automationRate, paymentSuccessRate, slaComplianceRate, workflowSuccessRate };
    for (const [key, value] of Object.entries(rates)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        return NextResponse.json(
          { error: `${key} must be a number between 0 and 1` },
          { status: 400 }
        );
      }
    }
    const snapshot = scoreTenantHealth(tenantId, {
      automationRate: automationRate as number,
      paymentSuccessRate: paymentSuccessRate as number,
      slaComplianceRate: slaComplianceRate as number,
      workflowSuccessRate: workflowSuccessRate as number,
    });
    return NextResponse.json(
      { action: "score_health", snapshot, trend: getHealthTrend(tenantId), success: true },
      { status: 201 }
    );
  }

  if (action === "set_control") {
    const { disabledEventTypes, aiEnabled, customRetryPolicy, reason } =
      body as Record<string, unknown>;
    const existing = getControl(tenantId);

    let retryPolicy = existing.customRetryPolicy;
    if (customRetryPolicy && typeof customRetryPolicy === "object") {
      const rp = customRetryPolicy as Record<string, unknown>;
      if (typeof rp.maxRetries !== "number" || typeof rp.baseDelayMs !== "number") {
        return NextResponse.json(
          { error: "customRetryPolicy requires numeric maxRetries and baseDelayMs" },
          { status: 400 }
        );
      }
      retryPolicy = { maxRetries: rp.maxRetries, baseDelayMs: rp.baseDelayMs };
    }

    const control: TenantAutomationControl = {
      tenantId,
      disabledEventTypes: Array.isArray(disabledEventTypes)
        ? (disabledEventTypes as string[])
        : existing.disabledEventTypes,
      aiEnabled: typeof aiEnabled === "boolean" ? aiEnabled : existing.aiEnabled,
      updatedAt: new Date().toISOString(),
      ...(existing.pausedUntil !== undefined ? { pausedUntil: existing.pausedUntil } : {}),
      ...(retryPolicy !== undefined ? { customRetryPolicy: retryPolicy } : {}),
      ...(typeof reason === "string" ? { reason } : {}),
    };
    setControl(control);
    return NextResponse.json({ action: "set_control", control, success: true });
  }

  if (action === "disable_event_type" || action === "enable_event_type") {
    const { eventType, reason } = body as Record<string, unknown>;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (action === "disable_event_type") {
      disableEventType(tenantId, eventType, typeof reason === "string" ? reason : undefined);
    } else {
      enableEventType(tenantId, eventType);
    }
    return NextResponse.json({ action, eventType, control: getControl(tenantId), success: true });
  }

  if (action === "pause_automation") {
    const { durationMs, reason } = body as Record<string, unknown>;
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
      return NextResponse.json({ error: "durationMs must be a positive number" }, { status: 400 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required for audit trail" }, { status: 400 });
    }
    pauseTenantAutomation(tenantId, durationMs, reason);
    return NextResponse.json({
      action: "pause_automation",
      control: getControl(tenantId),
      success: true,
    });
  }

  if (action === "check_event_allowed") {
    const { eventType } = body as Record<string, unknown>;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "check_event_allowed",
      eventType,
      allowed: isEventAllowed(tenantId, eventType),
      success: true,
    });
  }

  if (action === "check_throttle") {
    const { kind, eventRatePerMin, aiCallRatePerMin } = body as Record<string, unknown>;
    if (kind !== "event" && kind !== "ai_call") {
      return NextResponse.json({ error: "kind must be 'event' or 'ai_call'" }, { status: 400 });
    }
    const { eventRate, aiRate } = resolveRates(tenantId, eventRatePerMin, aiCallRatePerMin);
    const verdict =
      kind === "event"
        ? checkAndRecordEvent(tenantId, eventRate, aiRate)
        : checkAndRecordAICall(tenantId, eventRate, aiRate);
    return NextResponse.json({
      action: "check_throttle",
      kind,
      verdict,
      state: getOrCreateThrottle(tenantId, eventRate, aiRate),
      success: true,
    });
  }

  if (action === "set_isolation_config") {
    const { maxConcurrentEvents, maxQueueDepth, priorityLevel, isolatedWorker } =
      body as Record<string, unknown>;
    const existing = getIsolationConfig(tenantId);
    if (priorityLevel !== undefined && !VALID_PRIORITY_LEVELS.includes(priorityLevel as IsolationConfig["priorityLevel"])) {
      return NextResponse.json(
        { error: `priorityLevel must be one of: ${VALID_PRIORITY_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }
    const config: IsolationConfig = {
      tenantId,
      maxConcurrentEvents: num(maxConcurrentEvents, existing.maxConcurrentEvents),
      maxQueueDepth: num(maxQueueDepth, existing.maxQueueDepth),
      priorityLevel:
        (priorityLevel as IsolationConfig["priorityLevel"]) ?? existing.priorityLevel,
      isolatedWorker:
        typeof isolatedWorker === "boolean" ? isolatedWorker : existing.isolatedWorker,
      // Namespace stays derived from tenantId — never caller-supplied, or tenants could collide.
      resourceNamespace: existing.resourceNamespace,
    };
    setIsolationConfig(config);
    return NextResponse.json({ action: "set_isolation_config", config, success: true });
  }

  if (action === "check_isolation_bounds") {
    const { currentConcurrent, currentQueueDepth, recordIfViolated, violationType } =
      body as Record<string, unknown>;
    if (typeof currentConcurrent !== "number" || typeof currentQueueDepth !== "number") {
      return NextResponse.json(
        { error: "currentConcurrent and currentQueueDepth must be numbers" },
        { status: 400 }
      );
    }
    const result = checkIsolationBounds(tenantId, currentConcurrent, currentQueueDepth);

    if (!result.allowed && recordIfViolated === true) {
      if (!VALID_ISOLATION_VIOLATIONS.includes(violationType as IsolationViolation["violationType"])) {
        return NextResponse.json(
          { error: `violationType must be one of: ${VALID_ISOLATION_VIOLATIONS.join(", ")}` },
          { status: 400 }
        );
      }
      recordViolation({
        tenantId,
        violationType: violationType as IsolationViolation["violationType"],
        detail: result.violations.join("; "),
        detectedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      action: "check_isolation_bounds",
      result,
      violations: getViolations(tenantId),
      success: true,
    });
  }

  if (action === "record_metrics") {
    const {
      eventsProcessed, eventsFailed, aiCallsTotal, aiCallsSucceeded,
      totalCostUsd, avgLatencyMs, periodLabel,
    } = body as Record<string, unknown>;
    if (typeof periodLabel !== "string" || periodLabel.trim() === "") {
      return NextResponse.json({ error: "periodLabel required" }, { status: 400 });
    }
    recordTenantMetrics({
      tenantId,
      eventsProcessed: num(eventsProcessed, 0),
      eventsFailed: num(eventsFailed, 0),
      aiCallsTotal: num(aiCallsTotal, 0),
      aiCallsSucceeded: num(aiCallsSucceeded, 0),
      totalCostUsd: num(totalCostUsd, 0),
      avgLatencyMs: num(avgLatencyMs, 0),
      periodLabel,
    });
    return NextResponse.json(
      { action: "record_metrics", summary: getTenantSummary(tenantId) ?? null, success: true },
      { status: 201 }
    );
  }

  if (action === "compare_tenants") {
    // Comparing arbitrary tenants exposes cross-tenant data — super_admin only.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — cross-tenant comparison requires super_admin" },
        { status: 403 }
      );
    }
    const { tenantIds } = body as Record<string, unknown>;
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
      return NextResponse.json({ error: "tenantIds must be a non-empty array" }, { status: 400 });
    }
    if (!tenantIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "tenantIds must contain only strings" }, { status: 400 });
    }
    const comparison = getTenantComparison(tenantIds as string[]);
    return NextResponse.json({ action: "compare_tenants", comparison, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'score_health', 'set_control', 'disable_event_type', 'enable_event_type', 'pause_automation', 'check_event_allowed', 'check_throttle', 'set_isolation_config', 'check_isolation_bounds', 'record_metrics', or 'compare_tenants'.`,
    },
    { status: 400 }
  );
}
