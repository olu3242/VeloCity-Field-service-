// GET  /api/admin/regions — region registry, health reports, failover state, worker configs
// POST /api/admin/regions — register_region | update_region_health | score_region_health
//                           | evaluate_failover | activate_failover | deactivate_failover
//                           | latency_aware_route | set_worker_config | optimal_worker_count
// Admin-only. Region topology, failover state, and worker sizing are platform-wide
// infrastructure shared by every tenant, so all mutating actions require super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  REGIONS,
  registerRegion,
  updateRegionHealth,
  getActiveRegions,
  getPrimaryRegion,
  getRegionStatus,
  type Region,
  type RegionStatus,
} from "@/lib/regions/region-registry";
import {
  scoreRegionHealth,
  getRegionHealthReports,
  detectDegradedRegions,
  getLatencyAwareRoute,
} from "@/lib/regions/region-health-monitor";
import {
  evaluateFailover,
  activateFailover,
  deactivateFailover,
  isFailoverActive,
  getActiveRegionId,
} from "@/lib/regions/failover-router";
import {
  setWorkerConfig,
  getWorkerConfig,
  getAllWorkerConfigs,
  computeOptimalWorkerCount,
  type WorkerConfig,
} from "@/lib/regions/distributed-worker-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_REGION_STATUSES: RegionStatus[] = ["active", "degraded", "offline", "failover"];

const MUTATING_ACTIONS = new Set([
  "register_region", "update_region_health", "activate_failover",
  "deactivate_failover", "set_worker_config", "evaluate_failover",
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
  const regionId = url.searchParams.get("regionId");

  return NextResponse.json({
    registry: {
      all: Array.from(REGIONS.values()),
      active: getActiveRegions(),
      primary: getPrimaryRegion() ?? null,
      status: getRegionStatus(),
      ...(regionId ? { region: REGIONS.get(regionId) ?? null } : {}),
    },
    health: {
      reports: getRegionHealthReports(),
      degraded: detectDegradedRegions(),
      ...(regionId ? { report: scoreRegionHealth(regionId) ?? null } : {}),
    },
    failover: {
      active: isFailoverActive(),
      activeRegionId: getActiveRegionId(),
    },
    workers: {
      configs: getAllWorkerConfigs(),
      ...(regionId ? { config: getWorkerConfig(regionId) } : {}),
    },
    supportedStatuses: VALID_REGION_STATUSES,
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

  // evaluate_failover is included here because it is not a pure read — when the
  // primary is unhealthy it flips global failover state as a side effect.
  if (typeof action === "string" && MUTATING_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters platform-wide region state and requires super_admin` },
      { status: 403 }
    );
  }

  if (action === "register_region") {
    const { id, name, location, status, isPrimary, workerCount, queueDepth, avgLatencyMs } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (typeof name !== "string" || typeof location !== "string") {
      return NextResponse.json({ error: "name and location required" }, { status: 400 });
    }
    if (!VALID_REGION_STATUSES.includes(status as RegionStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_REGION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // Only one region may be primary — promoting a new one would otherwise leave
    // getPrimaryRegion() returning whichever happened to be found first.
    if (isPrimary === true) {
      const existingPrimary = getPrimaryRegion();
      if (existingPrimary && existingPrimary.id !== id) {
        return NextResponse.json(
          {
            error: `Region '${existingPrimary.id}' is already primary — demote it before promoting '${id}'`,
          },
          { status: 409 }
        );
      }
    }
    const region: Region = {
      id,
      name,
      location,
      status: status as RegionStatus,
      isPrimary: isPrimary === true,
      workerCount: num(workerCount, 1),
      queueDepth: num(queueDepth, 0),
      avgLatencyMs: num(avgLatencyMs, 50),
      lastHeartbeatAt: new Date().toISOString(),
    };
    registerRegion(region);
    return NextResponse.json({ action: "register_region", region, success: true }, { status: 201 });
  }

  if (action === "update_region_health") {
    const { regionId, status, workerCount, queueDepth, avgLatencyMs } = raw;
    if (typeof regionId !== "string") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    // updateRegionHealth silently no-ops on an unknown region — verify first.
    if (!REGIONS.has(regionId)) {
      return NextResponse.json({ error: `Unknown regionId: ${regionId}` }, { status: 404 });
    }
    if (status !== undefined && !VALID_REGION_STATUSES.includes(status as RegionStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_REGION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const updates = {
      ...(status !== undefined ? { status: status as RegionStatus } : {}),
      ...(typeof workerCount === "number" ? { workerCount } : {}),
      ...(typeof queueDepth === "number" ? { queueDepth } : {}),
      ...(typeof avgLatencyMs === "number" ? { avgLatencyMs } : {}),
      lastHeartbeatAt: new Date().toISOString(),
    };
    updateRegionHealth(regionId, updates);
    return NextResponse.json({
      action: "update_region_health",
      region: REGIONS.get(regionId) ?? null,
      health: scoreRegionHealth(regionId) ?? null,
      success: true,
    });
  }

  if (action === "score_region_health") {
    const { regionId } = raw;
    if (typeof regionId !== "string") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    const report = scoreRegionHealth(regionId);
    if (!report) {
      return NextResponse.json({ error: `Unknown regionId: ${regionId}` }, { status: 404 });
    }
    return NextResponse.json({ action: "score_region_health", report, success: true });
  }

  if (action === "evaluate_failover") {
    const decision = evaluateFailover();
    return NextResponse.json({
      action: "evaluate_failover",
      decision,
      failoverActive: isFailoverActive(),
      activeRegionId: getActiveRegionId(),
      success: true,
    });
  }

  if (action === "activate_failover") {
    const { regionId } = raw;
    if (typeof regionId !== "string") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    const target = REGIONS.get(regionId);
    if (!target) {
      return NextResponse.json({ error: `Unknown regionId: ${regionId}` }, { status: 404 });
    }
    // Failing traffic over to an offline region would black-hole it.
    if (target.status === "offline") {
      return NextResponse.json(
        { error: `Region '${regionId}' is offline and cannot receive failover traffic` },
        { status: 409 }
      );
    }
    activateFailover(regionId);
    return NextResponse.json({
      action: "activate_failover",
      activeRegionId: getActiveRegionId(),
      failoverActive: isFailoverActive(),
      success: true,
    });
  }

  if (action === "deactivate_failover") {
    const primary = getPrimaryRegion();
    // Clearing failover routes traffic back to the primary — refuse if it is not
    // healthy, or the platform would be pointed at a region that cannot serve.
    if (!primary) {
      return NextResponse.json(
        { error: "No healthy primary region — resolve primary health before deactivating failover" },
        { status: 409 }
      );
    }
    deactivateFailover();
    return NextResponse.json({
      action: "deactivate_failover",
      activeRegionId: getActiveRegionId(),
      failoverActive: isFailoverActive(),
      primary,
      success: true,
    });
  }

  if (action === "latency_aware_route") {
    const { preferredRegionId } = raw;
    const route = getLatencyAwareRoute(
      typeof preferredRegionId === "string" ? preferredRegionId : undefined
    );
    return NextResponse.json({ action: "latency_aware_route", route, success: true });
  }

  if (action === "set_worker_config") {
    const { regionId, minWorkers, maxWorkers, targetConcurrency, priorityLaneEnabled, aiCallsPerWorker, healthCheckIntervalMs } = raw;
    if (typeof regionId !== "string" || regionId.trim() === "") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    const existing = getWorkerConfig(regionId);
    const config: WorkerConfig = {
      regionId,
      minWorkers: num(minWorkers, existing.minWorkers),
      maxWorkers: num(maxWorkers, existing.maxWorkers),
      targetConcurrency: num(targetConcurrency, existing.targetConcurrency),
      priorityLaneEnabled:
        typeof priorityLaneEnabled === "boolean"
          ? priorityLaneEnabled
          : existing.priorityLaneEnabled,
      aiCallsPerWorker: num(aiCallsPerWorker, existing.aiCallsPerWorker),
      healthCheckIntervalMs: num(healthCheckIntervalMs, existing.healthCheckIntervalMs),
    };
    if (config.minWorkers < 1) {
      return NextResponse.json({ error: "minWorkers must be at least 1" }, { status: 400 });
    }
    if (config.maxWorkers < config.minWorkers) {
      return NextResponse.json(
        { error: "maxWorkers must be greater than or equal to minWorkers" },
        { status: 400 }
      );
    }
    if (config.targetConcurrency < 1) {
      return NextResponse.json({ error: "targetConcurrency must be at least 1" }, { status: 400 });
    }
    setWorkerConfig(config);
    return NextResponse.json({ action: "set_worker_config", config, success: true });
  }

  if (action === "optimal_worker_count") {
    const { regionId, queueDepth } = raw;
    if (typeof regionId !== "string") {
      return NextResponse.json({ error: "regionId required" }, { status: 400 });
    }
    if (typeof queueDepth !== "number" || queueDepth < 0) {
      return NextResponse.json({ error: "queueDepth must be a non-negative number" }, { status: 400 });
    }
    return NextResponse.json({
      action: "optimal_worker_count",
      regionId,
      optimalWorkers: computeOptimalWorkerCount(regionId, queueDepth),
      config: getWorkerConfig(regionId),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_region', 'update_region_health', 'score_region_health', 'evaluate_failover', 'activate_failover', 'deactivate_failover', 'latency_aware_route', 'set_worker_config', or 'optimal_worker_count'.`,
    },
    { status: 400 }
  );
}
