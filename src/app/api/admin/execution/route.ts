// GET  /api/admin/execution — recent execution traces + fabric health
// POST /api/admin/execution — trigger a test execution (admin only)
// Admin-only; tenant-scoped via profile.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { getFabricHealthSnapshot } from "@/lib/execution/engine";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const { searchParams } = new URL(request.url);
  const correlationFilter = searchParams.get("correlation");
  const workstreamFilter = searchParams.get("workstream");
  const limitParam = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

  try {
    const supabase = getAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Recent execution traces
    let query = supabase
      .from("system_events")
      .select("payload, created_at")
      .eq("tenant_id", tenantId)
      .in("event_type", ["execution.trace", "execution.metrics"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limitParam);

    if (correlationFilter) {
      query = query.contains("payload", { correlationId: correlationFilter });
    }

    const { data: traces, error: tracesError } = await query;

    if (tracesError) throw tracesError;

    // Recent events stream (for live view)
    let eventsQuery = supabase
      .from("system_events")
      .select("event_type, payload, created_at")
      .eq("tenant_id", tenantId)
      .like("event_type", "execution.%")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (workstreamFilter) {
      eventsQuery = eventsQuery.contains("payload", { workstream: workstreamFilter });
    }

    const { data: recentEvents } = await eventsQuery;

    // Fabric health
    const fabricHealth = getFabricHealthSnapshot();
    const platformHealth = await aggregatePlatformHealth(tenantId);

    // Summarize by workstream
    const workstreamSummary: Record<
      string,
      { count: number; successCount: number; avgDurationMs: number; lastSeenAt: string }
    > = {};

    for (const row of traces ?? []) {
      const p = row.payload as {
        workstream?: string;
        status?: string;
        durationMs?: number;
      };
      if (!p.workstream) continue;
      const ws = p.workstream;
      if (!workstreamSummary[ws]) {
        workstreamSummary[ws] = { count: 0, successCount: 0, avgDurationMs: 0, lastSeenAt: row.created_at };
      }
      workstreamSummary[ws].count++;
      if (p.status === "completed") workstreamSummary[ws].successCount++;
      workstreamSummary[ws].avgDurationMs =
        (workstreamSummary[ws].avgDurationMs * (workstreamSummary[ws].count - 1) +
          (p.durationMs ?? 0)) /
        workstreamSummary[ws].count;
    }

    return NextResponse.json({
      fabricHealth,
      platformHealth: {
        health: platformHealth.health,
        dependencies: platformHealth.dependencies,
        workers: platformHealth.workers,
        queues: platformHealth.queues,
        generatedAt: platformHealth.generatedAt,
      },
      traces: (traces ?? []).slice(0, 20).map((r) => r.payload),
      recentEvents: (recentEvents ?? []).map((r) => ({
        type: r.event_type,
        payload: r.payload,
        at: r.created_at,
      })),
      workstreamSummary,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution data unavailable" },
      { status: 500 },
    );
  }
}
