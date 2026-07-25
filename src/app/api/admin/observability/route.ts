// GET /api/admin/observability — distributed traces, latency map, slow operations, failure lineage
// Admin-only; tenant-agnostic (global observability signal).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getRecentTraces,
  getTrace,
} from "@/lib/observability/distributed-tracing";
import {
  getAllLatencyBuckets,
  getSlowOperations,
} from "@/lib/observability/latency-map";
import {
  getRecentFailures,
} from "@/lib/observability/failure-lineage";
import {
  getMostFrequentSequences,
  detectBottlenecks,
} from "@/lib/observability/correlation-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const traceLimit = Math.min(parseInt(url.searchParams.get("traces") ?? "20", 10), 100);
  const slowThresholdMs = parseInt(url.searchParams.get("slowMs") ?? "500", 10);
  const traceId = url.searchParams.get("traceId");

  if (traceId) {
    const trace = getTrace(traceId);
    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }
    return NextResponse.json({ trace });
  }

  const recentTraces = getRecentTraces(traceLimit);
  const latencyBuckets = getAllLatencyBuckets();
  const slowOperations = getSlowOperations(slowThresholdMs);
  const recentFailures = getRecentFailures(20);

  const p50Values: Record<string, number> = {};
  const p95Values: Record<string, number> = {};
  for (const b of latencyBuckets) {
    p50Values[b.operation] = b.p50Ms;
    p95Values[b.operation] = b.p95Ms;
  }

  const frequentSequences = getMostFrequentSequences(10);
  const bottlenecks = detectBottlenecks(slowThresholdMs);

  return NextResponse.json({
    traces: {
      recent: recentTraces,
      total: recentTraces.length,
    },
    latency: {
      buckets: latencyBuckets,
      slow: slowOperations,
      slowCount: slowOperations.length,
      p50: p50Values,
      p95: p95Values,
    },
    failures: recentFailures,
    correlations: {
      frequentSequences,
      bottlenecks,
    },
    generatedAt: new Date().toISOString(),
  });
}
