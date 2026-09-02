// GET  /api/admin/ops-telemetry — metric data, metric stats, anomaly summary, heatmap hotspots
// POST /api/admin/ops-telemetry — collect | detect_anomaly | acknowledge_anomaly | update_heatmap
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  collect,
  getMetric,
  getLatestValue,
  getMetricStats,
} from "@/lib/ops-telemetry/telemetry-collector";
import {
  detectAnomaly,
  acknowledgeAnomaly,
  getActiveAnomalies,
  getAnomalySummary,
  type OperationalAnomaly,
} from "@/lib/ops-telemetry/anomaly-intelligence";
import {
  updateHeatmapCell,
  getHeatmapByDimension,
  getHotspots,
  getHeatmapSnapshot,
} from "@/lib/ops-telemetry/operational-heatmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ANOMALY_CATEGORIES: OperationalAnomaly["category"][] = [
  "performance", "error_rate", "latency", "cost", "throughput",
];

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
  const metric = url.searchParams.get("metric");
  const heatmapDimension = url.searchParams.get("dimension");
  const category = url.searchParams.get("category") as OperationalAnomaly["category"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const hotspotLimit = Math.min(parseInt(url.searchParams.get("hotspotLimit") ?? "10", 10), 50);

  const anomalySummary = getAnomalySummary();
  const activeAnomalies = getActiveAnomalies(
    category && VALID_ANOMALY_CATEGORIES.includes(category) ? category : undefined
  );
  const heatmapSnapshot = heatmapDimension
    ? getHeatmapByDimension(heatmapDimension)
    : getHeatmapSnapshot();
  const hotspots = getHotspots(hotspotLimit);

  return NextResponse.json({
    tenantId,
    ...(metric
      ? {
          metric: {
            data: getMetric(metric, tenantId, limit),
            stats: getMetricStats(metric),
            latest: getLatestValue(metric, tenantId) ?? null,
          },
        }
      : {}),
    anomalies: {
      active: activeAnomalies,
      summary: anomalySummary,
    },
    heatmap: {
      cells: heatmapSnapshot,
      hotspots,
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

  if (action === "collect") {
    const { metric, value, unit, tags } = body as Record<string, unknown>;

    if (typeof metric !== "string" || typeof value !== "number" || typeof unit !== "string") {
      return NextResponse.json({ error: "metric, value, and unit required" }, { status: 400 });
    }

    const point = collect(
      metric,
      value,
      unit,
      (tags && typeof tags === "object") ? (tags as Record<string, string>) : undefined,
      tenantId
    );
    return NextResponse.json({ action: "collect", point, success: true }, { status: 201 });
  }

  if (action === "detect_anomaly") {
    const { metric, observed, baseline, category } = body as Record<string, unknown>;

    if (typeof metric !== "string" || typeof observed !== "number" || typeof baseline !== "number") {
      return NextResponse.json({ error: "metric, observed, and baseline required" }, { status: 400 });
    }
    if (!VALID_ANOMALY_CATEGORIES.includes(category as OperationalAnomaly["category"])) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_ANOMALY_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const anomaly = detectAnomaly(
      metric,
      observed,
      baseline,
      category as OperationalAnomaly["category"],
      tenantId
    );
    return NextResponse.json({ action: "detect_anomaly", anomaly, flagged: anomaly !== null, success: true });
  }

  if (action === "acknowledge_anomaly") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    acknowledgeAnomaly(id);
    return NextResponse.json({ action: "acknowledge_anomaly", id, success: true });
  }

  if (action === "update_heatmap") {
    const { dimension, key, value } = body as Record<string, unknown>;

    if (typeof dimension !== "string" || typeof key !== "string" || typeof value !== "number") {
      return NextResponse.json({ error: "dimension, key, and value required" }, { status: 400 });
    }

    const cell = updateHeatmapCell(dimension, key, value);
    return NextResponse.json({ action: "update_heatmap", cell, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'collect', 'detect_anomaly', 'acknowledge_anomaly', or 'update_heatmap'.` },
    { status: 400 }
  );
}
