// GET  /api/admin/global-intelligence — cross-tenant insights, benchmarks, ecosystem anomalies
// POST /api/admin/global-intelligence — record_insight | record_metric | detect_anomaly | resolve_anomaly
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordInsight,
  getInsightsByType,
  getRecentInsights,
  generatePlatformSummary,
  type CrossTenantInsight,
} from "@/lib/global-intelligence/cross-tenant-insights";
import {
  recordMetric,
  getBenchmark,
  getAllBenchmarks,
  compareToP50,
} from "@/lib/global-intelligence/benchmarking";
import {
  detectAnomaly,
  resolveAnomaly,
  getActiveAnomalies,
  getAnomalySummary,
} from "@/lib/global-intelligence/ecosystem-anomaly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INSIGHT_TYPES: CrossTenantInsight["insightType"][] = [
  "trend", "anomaly", "benchmark", "forecast",
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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const insightType = url.searchParams.get("insightType") as CrossTenantInsight["insightType"] | null;
  const metricName = url.searchParams.get("metricName");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const compareValue = url.searchParams.get("compareValue");

  const recentInsights = getRecentInsights(limit);
  const platformSummary = generatePlatformSummary();
  const allBenchmarks = getAllBenchmarks();
  const activeAnomalies = getActiveAnomalies();
  const anomalySummary = getAnomalySummary();

  return NextResponse.json({
    insights: {
      recent: recentInsights,
      platformSummary,
      ...(insightType && VALID_INSIGHT_TYPES.includes(insightType)
        ? { byType: getInsightsByType(insightType) }
        : {}),
    },
    benchmarks: {
      all: allBenchmarks,
      ...(metricName
        ? {
            metric: getBenchmark(metricName) ?? null,
            ...(compareValue !== null
              ? { comparison: compareToP50(metricName, parseFloat(compareValue)) }
              : {}),
          }
        : {}),
    },
    anomalies: {
      active: activeAnomalies,
      summary: anomalySummary,
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

  if (action === "record_insight") {
    const { insightType, title, summary, affectedTenantCount, confidenceScore, tags } =
      body as Record<string, unknown>;

    if (!VALID_INSIGHT_TYPES.includes(insightType as CrossTenantInsight["insightType"])) {
      return NextResponse.json(
        { error: `insightType must be one of: ${VALID_INSIGHT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof title !== "string" || typeof summary !== "string") {
      return NextResponse.json({ error: "title and summary required" }, { status: 400 });
    }

    const insight = recordInsight(
      {
        insightType: insightType as CrossTenantInsight["insightType"],
        title,
        summary,
        affectedTenantCount: typeof affectedTenantCount === "number" ? affectedTenantCount : 1,
        confidenceScore: typeof confidenceScore === "number" ? confidenceScore : 0.5,
        tags: Array.isArray(tags) ? (tags as string[]) : [],
      },
      tenantId
    );
    return NextResponse.json({ action: "record_insight", insight, success: true }, { status: 201 });
  }

  if (action === "record_metric") {
    const { metricName, value } = body as Record<string, unknown>;
    if (typeof metricName !== "string" || typeof value !== "number") {
      return NextResponse.json({ error: "metricName and value required" }, { status: 400 });
    }
    recordMetric(metricName, value);
    const benchmark = getBenchmark(metricName);
    return NextResponse.json({ action: "record_metric", benchmark, success: true });
  }

  if (action === "detect_anomaly") {
    const { metric, observed, expected, affectedTenantCount } = body as Record<string, unknown>;
    if (typeof metric !== "string" || typeof observed !== "number" || typeof expected !== "number") {
      return NextResponse.json({ error: "metric, observed, and expected required" }, { status: 400 });
    }
    const anomaly = detectAnomaly(
      metric,
      observed,
      expected,
      typeof affectedTenantCount === "number" ? affectedTenantCount : 1
    );
    return NextResponse.json({ action: "detect_anomaly", anomaly, flagged: anomaly !== null, success: true });
  }

  if (action === "resolve_anomaly") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    resolveAnomaly(id);
    return NextResponse.json({ action: "resolve_anomaly", id, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_insight', 'record_metric', 'detect_anomaly', or 'resolve_anomaly'.` },
    { status: 400 }
  );
}
