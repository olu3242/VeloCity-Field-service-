// GET /api/admin/realtime — live runtime events stream, worker heartbeats, stale workers, dispute summary
// Admin-only; tenant-aware (filters events by tenantId unless super_admin).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getRecentEvents,
  getEventsByCategory,
  type RuntimeEventCategory,
} from "@/lib/realtime/event-broadcaster";
import {
  getLatestHeartbeats,
  getStaleWorkers,
  isWorkerHealthy,
} from "@/lib/realtime/worker-heartbeat";
import {
  getLiveDisputes,
  getDisputeSummary,
} from "@/lib/realtime/dispute-state-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: RuntimeEventCategory[] = [
  "queue", "ai_call", "worker", "governance", "anomaly", "escalation",
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
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const categoryParam = url.searchParams.get("category") as RuntimeEventCategory | null;
  const severityParam = url.searchParams.get("severity") as "info" | "warning" | "critical" | null;

  const category = VALID_CATEGORIES.includes(categoryParam as RuntimeEventCategory)
    ? (categoryParam as RuntimeEventCategory)
    : null;

  // Fetch events — filter by category if specified
  let rawEvents = category
    ? getEventsByCategory(category, limit)
    : getRecentEvents(limit);

  // Tenant boundary: non-super admins only see their own tenant's events
  if (!isSuperAdmin) {
    rawEvents = rawEvents.filter((e) => e.tenantId === undefined || e.tenantId === tenantId);
  }

  // Severity filter
  if (severityParam) {
    rawEvents = rawEvents.filter((e) => e.severity === severityParam);
  }

  const events = rawEvents;

  // Event summary
  const criticalCount = events.filter((e) => e.severity === "critical").length;
  const warningCount = events.filter((e) => e.severity === "warning").length;
  const categoryBreakdown: Record<string, number> = {};
  for (const e of events) {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] ?? 0) + 1;
  }

  // Worker health
  const heartbeats = getLatestHeartbeats();
  const staleWorkers = getStaleWorkers();
  const workerSummary = heartbeats.map((hb) => ({
    workerId: hb.workerId,
    isHealthy: isWorkerHealthy(hb.workerId),
    cpuLoad: hb.cpuLoad,
    memoryUsageMb: hb.memoryUsageMb,
    activeJobs: hb.activeJobs,
    queueDepth: hb.queueDepth,
    timestamp: hb.timestamp,
  }));

  // Dispute state
  const liveDisputes = getLiveDisputes(isSuperAdmin ? undefined : tenantId);
  const disputeSummary = getDisputeSummary();

  return NextResponse.json({
    tenantId,
    events,
    summary: {
      total: events.length,
      critical: criticalCount,
      warning: warningCount,
      byCategory: categoryBreakdown,
    },
    workers: {
      all: workerSummary,
      stale: staleWorkers,
      staleCount: staleWorkers.length,
      healthyCount: workerSummary.filter((w) => w.isHealthy).length,
    },
    disputes: {
      live: liveDisputes,
      summary: disputeSummary,
    },
    generatedAt: new Date().toISOString(),
  });
}
