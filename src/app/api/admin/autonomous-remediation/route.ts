// GET  /api/admin/autonomous-remediation — detected incidents, open incidents, runbook library, remediation stats
// POST /api/admin/autonomous-remediation — detect | record_incident | update_incident | create_plan | approve_plan | complete_remediation | register_runbook
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  detectIncidents,
  recordIncident,
  updateIncidentStatus,
  getOpenIncidents,
  getIncidentStats,
  type DetectedIncident,
} from "@/lib/autonomous-remediation/incident-detector";
import {
  createRemediationPlan,
  approveAndExecute,
  completeRemediation,
  getActivePlans,
  getRemediationStats,
} from "@/lib/autonomous-remediation/remediation-engine";
import {
  getRunbook,
  registerRunbook,
  recordRunbookUse,
  getRunbookLibrary,
  type Runbook,
} from "@/lib/autonomous-remediation/runbook-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INCIDENT_TYPES: DetectedIncident["incidentType"][] = [
  "circuit_cascade", "queue_overflow", "agent_failure", "latency_spike",
  "payment_degradation", "tenant_isolation_breach",
];
const VALID_SEVERITIES: DetectedIncident["severity"][] = ["low", "medium", "high", "critical"];
const VALID_STATUSES: DetectedIncident["status"][] = ["open", "remediating", "resolved"];

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
  const runbookType = url.searchParams.get("runbookType");

  const openIncidents = getOpenIncidents();
  const incidentStats = getIncidentStats();
  const activePlans = getActivePlans();
  const remediationStats = getRemediationStats();
  const runbookLibrary = getRunbookLibrary();

  return NextResponse.json({
    incidents: {
      open: openIncidents,
      stats: incidentStats,
    },
    remediation: {
      activePlans,
      stats: remediationStats,
    },
    runbooks: {
      library: runbookLibrary,
      ...(runbookType ? { forType: getRunbook(runbookType) ?? null } : {}),
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

  if (action === "detect") {
    const incidents = detectIncidents();
    return NextResponse.json({ action: "detect", incidents, count: incidents.length, success: true });
  }

  if (action === "record_incident") {
    const { incidentType, severity, signals, autoRemediable } = body as Record<string, unknown>;

    if (!VALID_INCIDENT_TYPES.includes(incidentType as DetectedIncident["incidentType"])) {
      return NextResponse.json(
        { error: `incidentType must be one of: ${VALID_INCIDENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_SEVERITIES.includes(severity as DetectedIncident["severity"])) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
        { status: 400 }
      );
    }

    const incident = recordIncident(
      incidentType as DetectedIncident["incidentType"],
      severity as DetectedIncident["severity"],
      Array.isArray(signals) ? (signals as string[]) : [],
      autoRemediable === true,
      tenantId
    );
    return NextResponse.json({ action: "record_incident", incident, success: true }, { status: 201 });
  }

  if (action === "update_incident") {
    const { id, status } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as DetectedIncident["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateIncidentStatus(id, status as DetectedIncident["status"]);
    return NextResponse.json({ action: "update_incident", id, status, success: true });
  }

  if (action === "create_plan") {
    const { incidentId, steps, autoApprove } = body as Record<string, unknown>;
    if (typeof incidentId !== "string") {
      return NextResponse.json({ error: "incidentId required" }, { status: 400 });
    }
    if (!Array.isArray(steps)) {
      return NextResponse.json({ error: "steps array required" }, { status: 400 });
    }
    const plan = createRemediationPlan(
      incidentId,
      steps as { order: number; action: string; estimatedMs: number }[],
      autoApprove === true
    );
    return NextResponse.json({ action: "create_plan", plan, success: true }, { status: 201 });
  }

  if (action === "approve_plan") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    approveAndExecute(id);
    return NextResponse.json({ action: "approve_plan", id, success: true });
  }

  if (action === "complete_remediation") {
    const { id, outcome } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    completeRemediation(id, typeof outcome === "string" ? outcome : "completed");
    return NextResponse.json({ action: "complete_remediation", id, success: true });
  }

  if (action === "register_runbook") {
    const { incidentType, name, steps, estimatedResolutionMs, requiresHumanApproval } =
      body as Record<string, unknown>;

    if (typeof incidentType !== "string" || typeof name !== "string") {
      return NextResponse.json({ error: "incidentType and name required" }, { status: 400 });
    }

    const runbook: Runbook = {
      id: crypto.randomUUID(),
      incidentType,
      name,
      steps: Array.isArray(steps) ? (steps as string[]) : [],
      estimatedResolutionMs: typeof estimatedResolutionMs === "number" ? estimatedResolutionMs : 0,
      requiresHumanApproval: requiresHumanApproval === true,
      useCount: 0,
    };
    registerRunbook(runbook);
    return NextResponse.json({ action: "register_runbook", runbook, success: true }, { status: 201 });
  }

  if (action === "record_runbook_use") {
    const { incidentType } = body as Record<string, unknown>;
    if (typeof incidentType !== "string") {
      return NextResponse.json({ error: "incidentType required" }, { status: 400 });
    }
    recordRunbookUse(incidentType);
    return NextResponse.json({ action: "record_runbook_use", incidentType, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'detect', 'record_incident', 'update_incident', 'create_plan', 'approve_plan', 'complete_remediation', 'register_runbook', or 'record_runbook_use'.`,
    },
    { status: 400 }
  );
}
