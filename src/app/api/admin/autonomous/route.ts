// GET  /api/admin/autonomous — unified autonomous ops: governance, optimization, remediation
// POST /api/admin/autonomous — detect_incidents | create_remediation | approve_remediation | complete_remediation | identify_opportunity | approve_optimization | complete_optimization | dismiss_optimization
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreGovernanceHealth,
  detectDrift, getActiveDrifts, getDriftSummary, resolveDrift,
  recordHealthSnapshot, getHealthTrend,
  getPolicyAnalyticsSummary, getUnderperformingPolicies,
} from "@/lib/autonomous-governance";
import {
  identifyOpportunity, approveOptimization, completeOptimization, dismissOptimization,
  getOpportunitiesByDomain, getTopOpportunities,
  type OptimizationOpportunity,
} from "@/lib/autonomous-optimization/optimization-engine";
import {
  detectIncidents, recordIncident, getOpenIncidents, getIncidentStats,
  type DetectedIncident,
} from "@/lib/autonomous-remediation/incident-detector";
import {
  createRemediationPlan, approveAndExecute, completeRemediation,
  getActivePlans, getRemediationStats,
} from "@/lib/autonomous-remediation/remediation-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_OPT_DOMAINS: OptimizationOpportunity["domain"][] = ["workflow", "cost", "latency", "resilience", "queue"];
const VALID_EFFORT: OptimizationOpportunity["effortLevel"][] = ["low", "medium", "high"];
const VALID_INCIDENT_TYPES: DetectedIncident["incidentType"][] = [
  "circuit_cascade", "queue_overflow", "agent_failure", "latency_spike",
  "payment_degradation", "tenant_isolation_breach",
];
const VALID_SEVERITY: DetectedIncident["severity"][] = ["low", "medium", "high", "critical"];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return { error: "Forbidden", status: 403 as const, profile: null };
  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const optDomain = url.searchParams.get("optDomain") as OptimizationOpportunity["domain"] | null;

  const health = scoreGovernanceHealth();
  const activeDrifts = getActiveDrifts();
  const driftSummary = getDriftSummary();
  const healthTrend = getHealthTrend();
  const policyAnalytics = getPolicyAnalyticsSummary();
  const underperforming = getUnderperformingPolicies(0.7);
  const newDetections = detectIncidents();
  const openIncidents = getOpenIncidents();
  const activeOpts = optDomain && VALID_OPT_DOMAINS.includes(optDomain)
    ? getOpportunitiesByDomain(optDomain)
    : getTopOpportunities(20);

  return NextResponse.json({
    governance: { health, drifts: { active: activeDrifts, summary: driftSummary }, healthTrend, policies: { analytics: policyAnalytics, underperforming } },
    incidents: { detected: newDetections, open: openIncidents, stats: getIncidentStats() },
    optimization: { active: activeOpts },
    remediation: { active: getActivePlans(), stats: getRemediationStats() },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  getTenantId(auth.profile);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "detect_incidents") {
    const detected = detectIncidents();
    return NextResponse.json({ action, detected, count: detected.length, success: true });
  }

  if (action === "record_incident") {
    const { incidentType, severity, signals, autoRemediable, tenantId: bodyTenantId } = body as Record<string, unknown>;
    if (!VALID_INCIDENT_TYPES.includes(incidentType as DetectedIncident["incidentType"])) {
      return NextResponse.json({ error: `incidentType must be one of: ${VALID_INCIDENT_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_SEVERITY.includes(severity as DetectedIncident["severity"])) {
      return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITY.join(", ")}` }, { status: 400 });
    }
    const incident = recordIncident(
      incidentType as DetectedIncident["incidentType"],
      severity as DetectedIncident["severity"],
      Array.isArray(signals) ? signals as string[] : [],
      autoRemediable === true,
      typeof bodyTenantId === "string" ? bodyTenantId : undefined
    );
    return NextResponse.json({ action, incident, success: true }, { status: 201 });
  }

  if (action === "create_remediation") {
    const { incidentId, steps, autoApprove } = body as Record<string, unknown>;
    if (typeof incidentId !== "string") return NextResponse.json({ error: "incidentId required" }, { status: 400 });
    if (!Array.isArray(steps)) return NextResponse.json({ error: "steps array required" }, { status: 400 });
    const plan = createRemediationPlan(incidentId, steps as { order: number; action: string; estimatedMs: number }[], autoApprove === true);
    return NextResponse.json({ action, plan, success: true }, { status: 201 });
  }

  if (action === "approve_remediation") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    approveAndExecute(id);
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "complete_remediation") {
    const { id, outcome } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    completeRemediation(id, typeof outcome === "string" ? outcome : "completed");
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "record_health_snapshot") {
    const snapshot = recordHealthSnapshot();
    return NextResponse.json({ action, snapshot, success: true }, { status: 201 });
  }

  if (action === "resolve_drift") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    resolveDrift(id);
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "identify_opportunity") {
    const { domain, title, description, estimatedGainPct, effortLevel } = body as Record<string, unknown>;
    if (!VALID_OPT_DOMAINS.includes(domain as OptimizationOpportunity["domain"])) {
      return NextResponse.json({ error: `domain must be one of: ${VALID_OPT_DOMAINS.join(", ")}` }, { status: 400 });
    }
    if (typeof title !== "string" || typeof description !== "string") return NextResponse.json({ error: "title and description required" }, { status: 400 });
    if (!VALID_EFFORT.includes(effortLevel as OptimizationOpportunity["effortLevel"])) {
      return NextResponse.json({ error: `effortLevel must be one of: ${VALID_EFFORT.join(", ")}` }, { status: 400 });
    }
    const opp = identifyOpportunity(domain as OptimizationOpportunity["domain"], title, description, typeof estimatedGainPct === "number" ? estimatedGainPct : 0, effortLevel as OptimizationOpportunity["effortLevel"]);
    return NextResponse.json({ action, opp, success: true }, { status: 201 });
  }

  if (action === "approve_optimization") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    approveOptimization(id);
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "complete_optimization") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    completeOptimization(id);
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "dismiss_optimization") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    dismissOptimization(id);
    return NextResponse.json({ action, id, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'detect_incidents', 'record_incident', 'create_remediation', 'approve_remediation', 'complete_remediation', 'record_health_snapshot', 'resolve_drift', 'identify_opportunity', 'approve_optimization', 'complete_optimization', or 'dismiss_optimization'.` }, { status: 400 });
}
