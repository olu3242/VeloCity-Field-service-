// GET  /api/admin/runtime-state — component registry, health snapshot, runtime snapshots, drift reports
// POST /api/admin/runtime-state — register_component | update_heartbeat | capture_snapshot
//                                 | analyze_drift | report_drift | resolve_drift
// Admin-only; tenant-scoped. Tracks live component health, state snapshots, and configuration drift.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerComponent,
  updateHeartbeat,
  getComponent,
  getHealthySystems,
  getDegradedSystems,
  getAllRegistryEntries,
  getRegistrySnapshot,
  type RuntimeStateEntry,
} from "@/lib/runtime-state/state-registry";
import {
  captureSnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  getSnapshotTrend,
} from "@/lib/runtime-state/snapshot-engine";
import {
  analyzeDrift,
  reportDrift,
  resolveDrift,
  getActiveDrifts,
  getDriftSummary,
  type DriftReport,
} from "@/lib/runtime-state/drift-analyzer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES: RuntimeStateEntry["status"][] = ["healthy", "degraded", "critical", "unknown"];
const VALID_DRIFT_TYPES: DriftReport["driftType"][] = [
  "version_mismatch", "config_drift", "heartbeat_stale", "state_corruption",
];
const VALID_SEVERITIES: DriftReport["severity"][] = ["low", "medium", "high", "critical"];

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
  const component = url.searchParams.get("component");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    registry: {
      all: getAllRegistryEntries(),
      healthy: getHealthySystems(),
      degraded: getDegradedSystems(),
      snapshot: getRegistrySnapshot(),
      ...(component ? { component: getComponent(component) ?? null } : {}),
    },
    snapshots: {
      latest: getLatestSnapshot() ?? null,
      history: getSnapshotHistory(limit),
      trend: getSnapshotTrend(),
    },
    drift: {
      active: getActiveDrifts(),
      summary: getDriftSummary(),
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

  const { action } = body as Record<string, unknown>;

  if (action === "register_component") {
    const { component, version, metadata } = body as Record<string, unknown>;
    if (typeof component !== "string" || component.trim() === "") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (typeof version !== "string" || version.trim() === "") {
      return NextResponse.json({ error: "version required" }, { status: 400 });
    }
    const entry = registerComponent(
      component,
      version,
      metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined,
      tenantId
    );
    return NextResponse.json({ action: "register_component", entry, success: true }, { status: 201 });
  }

  if (action === "update_heartbeat") {
    const { component, status, metadata } = body as Record<string, unknown>;
    if (typeof component !== "string") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as RuntimeStateEntry["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!getComponent(component)) {
      return NextResponse.json(
        { error: `Component not registered: ${component}` },
        { status: 404 }
      );
    }
    updateHeartbeat(
      component,
      status as RuntimeStateEntry["status"],
      metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined
    );
    return NextResponse.json({
      action: "update_heartbeat",
      entry: getComponent(component),
      success: true,
    });
  }

  if (action === "capture_snapshot") {
    const snapshot = captureSnapshot();
    return NextResponse.json(
      { action: "capture_snapshot", snapshot, trend: getSnapshotTrend(), success: true },
      { status: 201 }
    );
  }

  if (action === "analyze_drift") {
    const newDrifts = analyzeDrift();
    return NextResponse.json({
      action: "analyze_drift",
      newDrifts,
      detected: newDrifts.length,
      summary: getDriftSummary(),
      success: true,
    });
  }

  if (action === "report_drift") {
    const { component, driftType, severity, detail } = body as Record<string, unknown>;
    if (typeof component !== "string" || component.trim() === "") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (!VALID_DRIFT_TYPES.includes(driftType as DriftReport["driftType"])) {
      return NextResponse.json(
        { error: `driftType must be one of: ${VALID_DRIFT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_SEVERITIES.includes(severity as DriftReport["severity"])) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof detail !== "string" || detail.trim() === "") {
      return NextResponse.json({ error: "detail required" }, { status: 400 });
    }
    const drift = reportDrift(
      component,
      driftType as DriftReport["driftType"],
      severity as DriftReport["severity"],
      detail
    );
    return NextResponse.json({ action: "report_drift", drift, success: true }, { status: 201 });
  }

  if (action === "resolve_drift") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!getActiveDrifts().some((d) => d.id === id)) {
      return NextResponse.json({ error: `No active drift with id: ${id}` }, { status: 404 });
    }
    resolveDrift(id);
    return NextResponse.json({
      action: "resolve_drift",
      id,
      summary: getDriftSummary(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_component', 'update_heartbeat', 'capture_snapshot', 'analyze_drift', 'report_drift', or 'resolve_drift'.`,
    },
    { status: 400 }
  );
}
