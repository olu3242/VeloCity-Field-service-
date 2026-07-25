// GET  /api/admin/executive — KPI history, off-track KPIs, executive summaries, predictive alerts
// POST /api/admin/executive — generate_summary | record_kpi | generate_capacity_alert
//                             | generate_cost_alert | acknowledge_alert
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordKPI,
  getKPIStatus,
  getOffTrackKPIs,
  getKPIHistory,
} from "@/lib/executive-intelligence/kpi-synthesizer";
import {
  generateSummary,
  getLatestSummary,
  getSummaryHistory,
} from "@/lib/executive-intelligence/operational-summary";
import {
  generateCapacityAlert,
  generateCostAlert,
  getActiveAlerts,
  acknowledgeAlert,
} from "@/lib/executive-intelligence/predictive-alerts";

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
  const kpiName = url.searchParams.get("kpiName");
  const summaryLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  const offTrackKPIs = getOffTrackKPIs();
  const latestSummary = getLatestSummary();
  const summaryHistory = getSummaryHistory(summaryLimit);
  const activeAlerts = getActiveAlerts();

  return NextResponse.json({
    kpis: {
      offTrack: offTrackKPIs,
      ...(kpiName ? { history: getKPIHistory(kpiName), allStatuses: getKPIStatus() } : {}),
    },
    summaries: {
      latest: latestSummary,
      history: summaryHistory,
    },
    alerts: {
      active: activeAlerts,
      count: activeAlerts.length,
      critical: activeAlerts.filter((a) => a.impactLevel === "critical").length,
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

  if (action === "record_kpi") {
    const { kpiName, value, unit, target } = body as Record<string, unknown>;
    if (typeof kpiName !== "string" || typeof value !== "number" || typeof unit !== "string") {
      return NextResponse.json({ error: "kpiName, value, and unit required" }, { status: 400 });
    }
    const snapshot = recordKPI(kpiName, value, unit, typeof target === "number" ? target : undefined);
    return NextResponse.json({ action: "record_kpi", snapshot, success: true });
  }

  if (action === "generate_summary") {
    const { automationROIUsd, incidentsOpen, slaComplianceRate, topRisks, topOpportunities } =
      body as Record<string, unknown>;

    const summary = generateSummary({
      automationROIUsd: typeof automationROIUsd === "number" ? automationROIUsd : 0,
      incidentsOpen: typeof incidentsOpen === "number" ? incidentsOpen : 0,
      slaComplianceRate: typeof slaComplianceRate === "number" ? slaComplianceRate : 1.0,
      topRisks: Array.isArray(topRisks) ? (topRisks as string[]) : [],
      topOpportunities: Array.isArray(topOpportunities) ? (topOpportunities as string[]) : [],
    });
    return NextResponse.json({ action: "generate_summary", summary, success: true });
  }

  if (action === "generate_capacity_alert") {
    const { queueDepth, workerCount } = body as Record<string, unknown>;
    if (typeof queueDepth !== "number" || typeof workerCount !== "number") {
      return NextResponse.json({ error: "queueDepth and workerCount required" }, { status: 400 });
    }
    const alert = generateCapacityAlert(queueDepth, workerCount);
    return NextResponse.json({ action: "generate_capacity_alert", alert, generated: alert !== null, success: true });
  }

  if (action === "generate_cost_alert") {
    const { actualCostUsd, budgetCostUsd } = body as Record<string, unknown>;
    if (typeof actualCostUsd !== "number" || typeof budgetCostUsd !== "number") {
      return NextResponse.json({ error: "actualCostUsd and budgetCostUsd required" }, { status: 400 });
    }
    const alert = generateCostAlert(actualCostUsd, budgetCostUsd);
    return NextResponse.json({ action: "generate_cost_alert", alert, generated: alert !== null, success: true });
  }

  if (action === "acknowledge_alert") {
    const { alertId } = body as Record<string, unknown>;
    if (typeof alertId !== "string") {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }
    acknowledgeAlert(alertId);
    return NextResponse.json({ action: "acknowledge_alert", alertId, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_kpi', 'generate_summary', 'generate_capacity_alert', 'generate_cost_alert', or 'acknowledge_alert'.`,
    },
    { status: 400 }
  );
}
