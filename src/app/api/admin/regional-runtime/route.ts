// GET  /api/admin/regional-runtime — region config, latency matrix, sync queue
// POST /api/admin/regional-runtime — register_region | update_region_health | select_region
//                                    | record_latency | fastest_region
//                                    | init_sync | complete_sync | sync_stats
// Admin-only; tenant-scoped for auth. Region topology, latency measurements and cross-region
// sync are shared platform infrastructure with no tenant dimension, so every mutating action
// requires super_admin — one tenant's admin must not repoint the platform's regions.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerRegion,
  updateRegionHealth,
  getActiveRegions,
  getPrimaryRegion,
  selectRegion,
  type RegionConfig,
} from "@/lib/regional-runtime/region-orchestrator";
import {
  recordLatency,
  getAvgLatency,
  getFastestRegion,
  getLatencyMatrix,
} from "@/lib/regional-runtime/latency-router";
import {
  initSync,
  completeSync,
  getSyncStats,
  getPendingSyncs,
  getFailedSyncs,
  type SyncOperation,
} from "@/lib/regional-runtime/cross-region-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_REGION_STATUSES: RegionConfig["status"][] = ["active", "degraded", "offline", "failover"];
const VALID_DATA_TYPES: SyncOperation["dataType"][] = [
  "workflow_state", "tenant_config", "agent_registry", "queue_metrics",
];
const VALID_SYNC_OUTCOMES = ["synced", "failed"] as const;

const MUTATING_ACTIONS = new Set([
  "register_region", "update_region_health", "record_latency", "init_sync", "complete_sync",
]);

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  return NextResponse.json({
    regions: {
      active: getActiveRegions(),
      primary: getPrimaryRegion() ?? null,
    },
    latency: {
      matrix: getLatencyMatrix(),
      fastest: getFastestRegion() ?? null,
      ...(from && to ? { average: getAvgLatency(from, to) } : {}),
    },
    sync: {
      pending: getPendingSyncs(),
      failed: getFailedSyncs(),
      stats: getSyncStats(),
    },
    supported: {
      regionStatuses: VALID_REGION_STATUSES,
      dataTypes: VALID_DATA_TYPES,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  if (typeof action === "string" && MUTATING_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters shared region infrastructure and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Region orchestrator ─────────────────────────────────────────────────

  if (action === "register_region") {
    const { regionId, name, endpoint, status, isPrimary, workerCount, latencyMs } = raw;
    if (typeof regionId !== "string" || regionId.trim() === "") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    if (typeof name !== "string" || typeof endpoint !== "string") {
      return NextResponse.json({ error: "name and endpoint required" }, { status: 400 });
    }
    if (!VALID_REGION_STATUSES.includes(status as RegionConfig["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_REGION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // Only one region may be primary — a second would make getPrimaryRegion
    // return whichever happened to be found first.
    if (isPrimary === true) {
      const existing = getPrimaryRegion();
      if (existing && existing.regionId !== regionId) {
        return NextResponse.json(
          { error: `Region '${existing.regionId}' is already primary — demote it before promoting '${regionId}'` },
          { status: 409 }
        );
      }
    }
    const region = registerRegion({
      regionId,
      name,
      endpoint,
      status: status as RegionConfig["status"],
      isPrimary: isPrimary === true,
      workerCount: num(workerCount, 1),
      latencyMs: num(latencyMs, 50),
    });
    return NextResponse.json({ action, region, success: true }, { status: 201 });
  }

  if (action === "update_region_health") {
    const { regionId, status, latencyMs, workerCount } = raw;
    if (typeof regionId !== "string") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    if (!VALID_REGION_STATUSES.includes(status as RegionConfig["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_REGION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // updateRegionHealth silently no-ops on an unknown region.
    const known = selectRegion(regionId);
    if (known.regionId !== regionId) {
      return NextResponse.json({ error: `Unknown regionId: ${regionId}` }, { status: 404 });
    }
    updateRegionHealth(
      regionId,
      status as RegionConfig["status"],
      num(latencyMs, known.latencyMs),
      num(workerCount, known.workerCount)
    );
    return NextResponse.json({
      action,
      region: selectRegion(regionId),
      active: getActiveRegions().length,
      success: true,
    });
  }

  if (action === "select_region") {
    const { preferredRegion } = raw;
    try {
      const region = selectRegion(
        typeof preferredRegion === "string" ? preferredRegion : undefined
      );
      return NextResponse.json({
        action,
        region,
        // selectRegion falls back when the preference is unavailable — say so
        // rather than implying the requested region was chosen.
        honouredPreference:
          typeof preferredRegion !== "string" || region.regionId === preferredRegion,
        success: true,
      });
    } catch (err) {
      // Thrown only when no region exists at all.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Region selection failed" },
        { status: 409 }
      );
    }
  }

  // ── Latency router ──────────────────────────────────────────────────────

  if (action === "record_latency") {
    const { regionId, targetRegion, latencyMs } = raw;
    if (typeof regionId !== "string" || typeof targetRegion !== "string") {
      return NextResponse.json({ error: "regionId and targetRegion required" }, { status: 400 });
    }
    if (regionId === targetRegion) {
      return NextResponse.json(
        { error: "regionId and targetRegion must differ" },
        { status: 400 }
      );
    }
    if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) {
      return NextResponse.json({ error: "latencyMs must be a non-negative number" }, { status: 400 });
    }
    recordLatency(regionId, targetRegion, latencyMs);
    return NextResponse.json({
      action,
      average: getAvgLatency(regionId, targetRegion),
      matrix: getLatencyMatrix(),
      success: true,
    });
  }

  if (action === "fastest_region") {
    const { excludeRegions } = raw;
    const exclude = Array.isArray(excludeRegions)
      ? excludeRegions.filter((r): r is string => typeof r === "string")
      : undefined;
    const fastest = getFastestRegion(exclude);
    if (!fastest) {
      return NextResponse.json(
        { error: "No region qualifies after exclusions", excluded: exclude ?? [] },
        { status: 404 }
      );
    }
    return NextResponse.json({ action, fastest, success: true });
  }

  // ── Cross-region sync ───────────────────────────────────────────────────

  if (action === "init_sync") {
    const { sourceRegion, targetRegion, dataType, recordCount } = raw;
    if (typeof sourceRegion !== "string" || typeof targetRegion !== "string") {
      return NextResponse.json({ error: "sourceRegion and targetRegion required" }, { status: 400 });
    }
    if (sourceRegion === targetRegion) {
      return NextResponse.json(
        { error: "sourceRegion and targetRegion must differ" },
        { status: 400 }
      );
    }
    if (!VALID_DATA_TYPES.includes(dataType as SyncOperation["dataType"])) {
      return NextResponse.json(
        { error: `dataType must be one of: ${VALID_DATA_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof recordCount !== "number" || recordCount < 0) {
      return NextResponse.json({ error: "recordCount must be non-negative" }, { status: 400 });
    }
    const sync = initSync(
      sourceRegion,
      targetRegion,
      dataType as SyncOperation["dataType"],
      recordCount
    );
    return NextResponse.json({ action, sync, success: true }, { status: 201 });
  }

  if (action === "complete_sync") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_SYNC_OUTCOMES.includes(status as (typeof VALID_SYNC_OUTCOMES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_SYNC_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    // completeSync no-ops on an unknown id — verify against the pending queue.
    if (!getPendingSyncs().some((s) => s.id === id)) {
      return NextResponse.json({ error: `No pending sync with id: ${id}` }, { status: 404 });
    }
    completeSync(id, status as (typeof VALID_SYNC_OUTCOMES)[number]);
    return NextResponse.json({ action, id, status, stats: getSyncStats(), success: true });
  }

  if (action === "sync_stats") {
    const { sourceRegion } = raw;
    return NextResponse.json({
      action,
      stats: getSyncStats(typeof sourceRegion === "string" ? sourceRegion : undefined),
      pending: getPendingSyncs().length,
      failed: getFailedSyncs().length,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_region', 'update_region_health', 'select_region', 'record_latency', 'fastest_region', 'init_sync', 'complete_sync', or 'sync_stats'.`,
    },
    { status: 400 }
  );
}
