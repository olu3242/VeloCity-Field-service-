// GET  /api/admin/sla — at-risk SLA entries, breach predictions, priority routes, timers
// POST /api/admin/sla — resolve | register_route | fire_timers
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getAtRiskSLAs,
  resolveSLA,
  updateSLAStatus,
} from "@/lib/sla/breach-predictor";
import {
  getAllRoutes,
  registerPriorityRoute,
  type SLAPriorityRoute,
} from "@/lib/sla/priority-routing";
import {
  checkAndFireTimers,
  getPendingTimers,
  getTimerStats,
} from "@/lib/sla/escalation-timer";

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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const allTenants = url.searchParams.get("allTenants") === "true" && auth.profile.role === "super_admin";

  const atRisk = getAtRiskSLAs(allTenants ? undefined : tenantId);
  const routes = getAllRoutes();
  const pendingTimers = getPendingTimers(allTenants ? undefined : tenantId);
  const timerStats = getTimerStats();

  const breached = atRisk.filter((p) => p.predictedStatus === "breached");
  const atRiskOnly = atRisk.filter((p) => p.predictedStatus === "at_risk");

  return NextResponse.json({
    tenantId,
    atRisk,
    summary: {
      total: atRisk.length,
      breached: breached.length,
      atRisk: atRiskOnly.length,
    },
    routes,
    pendingTimers,
    timerStats,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action, entryId, status, route } = body as Record<string, unknown>;

  if (action === "resolve") {
    if (typeof entryId !== "string") {
      return NextResponse.json({ error: "entryId required" }, { status: 400 });
    }
    resolveSLA(entryId);
    return NextResponse.json({ action: "resolve", entryId, success: true });
  }

  if (action === "update_status") {
    if (typeof entryId !== "string") {
      return NextResponse.json({ error: "entryId required" }, { status: 400 });
    }
    if (status !== "safe" && status !== "at_risk" && status !== "breached" && status !== "resolved") {
      return NextResponse.json(
        { error: "status must be safe | at_risk | breached | resolved" },
        { status: 400 }
      );
    }
    updateSLAStatus(entryId, status);
    return NextResponse.json({ action: "update_status", entryId, status, success: true });
  }

  if (action === "register_route") {
    if (!route || typeof route !== "object") {
      return NextResponse.json({ error: "route object required" }, { status: 400 });
    }
    const r = route as Partial<SLAPriorityRoute>;
    if (typeof r.eventType !== "string") {
      return NextResponse.json({ error: "route.eventType required" }, { status: 400 });
    }
    if (!["low", "medium", "high", "emergency"].includes(r.urgency ?? "")) {
      return NextResponse.json(
        { error: "route.urgency must be low | medium | high | emergency" },
        { status: 400 }
      );
    }
    registerPriorityRoute({
      eventType: r.eventType,
      tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
      urgency: r.urgency as SLAPriorityRoute["urgency"],
      priorityBoost: typeof r.priorityBoost === "number" ? r.priorityBoost : 0,
      maxQueueWaitMs: typeof r.maxQueueWaitMs === "number" ? r.maxQueueWaitMs : 30_000,
      dedicatedWorker: r.dedicatedWorker === true,
    });
    return NextResponse.json({ action: "register_route", eventType: r.eventType, success: true });
  }

  if (action === "fire_timers") {
    const fired = await checkAndFireTimers();
    return NextResponse.json({ action: "fire_timers", fired, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'resolve', 'update_status', 'register_route', or 'fire_timers'.` },
    { status: 400 }
  );
}
