// GET  /api/admin/cross-platform — platform registry, this tenant's executions, sync history
// POST /api/admin/cross-platform — register_platform | update_platform_status
//                                  | initiate_execution | update_execution_status
//                                  | record_sync | sync_stats
// Admin-only. Cross-platform executions carry a tenantId and are guarded to the caller's
// tenant. The platform registry and sync log describe shared external connections with no
// tenant dimension, so mutating them requires super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { isRuntimePaused } from "@/lib/governance/operator";
import {
  PLATFORMS,
  registerPlatform,
  updatePlatformStatus,
  getConnectedPlatforms,
  getPlatformsByType,
  type ExternalPlatform,
} from "@/lib/cross-platform/platform-registry";
import {
  initiateExecution,
  updateExecutionStatus,
  getActiveExecutions,
  getExecutionById,
  type CrossPlatformExecution,
} from "@/lib/cross-platform/execution-bridge";
import {
  recordSync,
  getRecentSyncs,
  getSyncStats,
  type SyncRecord,
} from "@/lib/cross-platform/sync-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PLATFORM_TYPES: ExternalPlatform["type"][] = [
  "erp", "crm", "payment", "logistics", "custom",
];
const VALID_PLATFORM_STATUSES: ExternalPlatform["status"][] = [
  "connected", "degraded", "disconnected",
];
const VALID_EXECUTION_STATUSES: CrossPlatformExecution["status"][] = [
  "initiated", "in_progress", "completed", "failed",
];
const VALID_DIRECTIONS: SyncRecord["direction"][] = ["inbound", "outbound", "bidirectional"];
const VALID_SYNC_STATUSES: SyncRecord["status"][] = ["success", "partial", "failed"];

const PLATFORM_ACTIONS = new Set(["register_platform", "update_platform_status", "record_sync"]);

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

// Resolves an execution only if it belongs to this tenant.
function ownedExecution(id: string, tenantId: string): CrossPlatformExecution | undefined {
  const execution = getExecutionById(id);
  if (!execution || execution.tenantId !== tenantId) return undefined;
  return execution;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const platformId = url.searchParams.get("platformId");
  const type = url.searchParams.get("type") as ExternalPlatform["type"] | null;
  const executionId = url.searchParams.get("executionId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    platforms: {
      all: Array.from(PLATFORMS.values()),
      connected: getConnectedPlatforms(),
      ...(type && VALID_PLATFORM_TYPES.includes(type)
        ? { byType: getPlatformsByType(type) }
        : {}),
      ...(platformId ? { platform: PLATFORMS.get(platformId) ?? null } : {}),
    },
    executions: {
      active: getActiveExecutions(tenantId),
      ...(executionId ? { execution: ownedExecution(executionId, tenantId) ?? null } : {}),
    },
    syncs: {
      recent: getRecentSyncs(platformId ?? undefined, limit),
      ...(platformId ? { stats: getSyncStats(platformId) } : {}),
    },
    runtimePaused: isRuntimePaused(),
    supported: {
      platformTypes: VALID_PLATFORM_TYPES,
      platformStatuses: VALID_PLATFORM_STATUSES,
      executionStatuses: VALID_EXECUTION_STATUSES,
      syncDirections: VALID_DIRECTIONS,
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

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (typeof action === "string" && PLATFORM_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters shared external platform state and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Platform registry ───────────────────────────────────────────────────

  if (action === "register_platform") {
    const { id, name, type, endpoint } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!VALID_PLATFORM_TYPES.includes(type as ExternalPlatform["type"])) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_PLATFORM_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof endpoint !== "string" || endpoint.trim() === "") {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }
    // Re-registering resets an existing platform to "disconnected", which would
    // silently sever a live integration.
    if (PLATFORMS.has(id)) {
      return NextResponse.json(
        { error: `Platform '${id}' is already registered — use update_platform_status instead` },
        { status: 409 }
      );
    }
    const platform = registerPlatform({
      id,
      name,
      type: type as ExternalPlatform["type"],
      endpoint,
    });
    return NextResponse.json({ action: "register_platform", platform, success: true }, { status: 201 });
  }

  if (action === "update_platform_status") {
    const { id, status, latencyMs } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!PLATFORMS.has(id)) {
      return NextResponse.json({ error: `Unknown platform id: ${id}` }, { status: 404 });
    }
    if (!VALID_PLATFORM_STATUSES.includes(status as ExternalPlatform["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_PLATFORM_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (latencyMs !== undefined && (typeof latencyMs !== "number" || latencyMs < 0)) {
      return NextResponse.json({ error: "latencyMs must be non-negative" }, { status: 400 });
    }
    updatePlatformStatus(
      id,
      status as ExternalPlatform["status"],
      typeof latencyMs === "number" ? latencyMs : undefined
    );
    return NextResponse.json({
      action: "update_platform_status",
      platform: PLATFORMS.get(id) ?? null,
      success: true,
    });
  }

  // ── Execution bridge ────────────────────────────────────────────────────

  if (action === "initiate_execution") {
    const { sourcePlatform, targetPlatform, workflowId } = raw;
    if (typeof sourcePlatform !== "string" || typeof targetPlatform !== "string") {
      return NextResponse.json(
        { error: "sourcePlatform and targetPlatform required" },
        { status: 400 }
      );
    }
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    // Both endpoints must be registered, or the execution targets nothing.
    const missing = [sourcePlatform, targetPlatform].filter((p) => !PLATFORMS.has(p));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown platform(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }
    const execution = initiateExecution(sourcePlatform, targetPlatform, workflowId, tenantId);
    // While paused, the bridge records a pre-failed execution with a "PAUSED:"
    // workflowId rather than throwing — report that as 409, not a started run.
    const blocked = execution.status === "failed";
    return NextResponse.json(
      {
        action: "initiate_execution",
        execution,
        ...(blocked ? { error: "Runtime is paused — execution was not started" } : {}),
        success: !blocked,
      },
      { status: blocked ? 409 : 201 }
    );
  }

  if (action === "update_execution_status") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const execution = ownedExecution(id, tenantId);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found for this tenant" }, { status: 404 });
    }
    if (!VALID_EXECUTION_STATUSES.includes(status as CrossPlatformExecution["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_EXECUTION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (execution.status === "completed" || execution.status === "failed") {
      return NextResponse.json(
        { error: `Execution is already '${execution.status}' and cannot be reopened` },
        { status: 409 }
      );
    }
    updateExecutionStatus(id, status as CrossPlatformExecution["status"]);
    return NextResponse.json({
      action: "update_execution_status",
      execution: getExecutionById(id) ?? null,
      success: true,
    });
  }

  // ── Sync tracker ────────────────────────────────────────────────────────

  if (action === "record_sync") {
    const { platformId, direction, entityType, recordsSynced, status, durationMs } = raw;
    if (typeof platformId !== "string") {
      return NextResponse.json({ error: "platformId required" }, { status: 400 });
    }
    if (!PLATFORMS.has(platformId)) {
      return NextResponse.json({ error: `Unknown platform id: ${platformId}` }, { status: 404 });
    }
    if (!VALID_DIRECTIONS.includes(direction as SyncRecord["direction"])) {
      return NextResponse.json(
        { error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof entityType !== "string" || entityType.trim() === "") {
      return NextResponse.json({ error: "entityType required" }, { status: 400 });
    }
    if (!VALID_SYNC_STATUSES.includes(status as SyncRecord["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_SYNC_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof recordsSynced !== "number" || recordsSynced < 0) {
      return NextResponse.json({ error: "recordsSynced must be non-negative" }, { status: 400 });
    }
    if (typeof durationMs !== "number" || durationMs < 0) {
      return NextResponse.json({ error: "durationMs must be non-negative" }, { status: 400 });
    }
    const record = recordSync(
      platformId,
      direction as SyncRecord["direction"],
      entityType,
      recordsSynced,
      status as SyncRecord["status"],
      durationMs
    );
    return NextResponse.json(
      { action: "record_sync", record, stats: getSyncStats(platformId), success: true },
      { status: 201 }
    );
  }

  if (action === "sync_stats") {
    const { platformId } = raw;
    if (typeof platformId !== "string") {
      return NextResponse.json({ error: "platformId required" }, { status: 400 });
    }
    if (!PLATFORMS.has(platformId)) {
      return NextResponse.json({ error: `Unknown platform id: ${platformId}` }, { status: 404 });
    }
    return NextResponse.json({
      action: "sync_stats",
      platformId,
      stats: getSyncStats(platformId),
      recent: getRecentSyncs(platformId, 20),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_platform', 'update_platform_status', 'initiate_execution', 'update_execution_status', 'record_sync', or 'sync_stats'.`,
    },
    { status: 400 }
  );
}
