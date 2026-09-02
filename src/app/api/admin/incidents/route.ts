// GET  /api/admin/incidents — open incidents, severity breakdown, classification
// POST /api/admin/incidents — create | update | classify
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  createIncident,
  updateIncident,
  getOpenIncidents,
  getIncidentsBySeverity,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/lib/incidents/incident-manager";
import {
  classifySeverity,
  getSeverityLabel,
  getSeverityResponseSlaMs,
  type ClassificationInput,
} from "@/lib/incidents/severity-classifier";

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
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const severityFilter = url.searchParams.get("severity") as IncidentSeverity | null;

  const openIncidents = getOpenIncidents(isSuperAdmin ? undefined : tenantId);

  const bySeverity: Record<string, number> = { sev1: 0, sev2: 0, sev3: 0, sev4: 0 };
  for (const inc of openIncidents) {
    bySeverity[inc.severity] = (bySeverity[inc.severity] ?? 0) + 1;
  }

  const filtered = severityFilter
    ? openIncidents.filter((i) => i.severity === severityFilter)
    : openIncidents;

  // Enrich with SLA response time and label
  const enriched = filtered.map((inc) => ({
    ...inc,
    severityLabel: getSeverityLabel(inc.severity),
    responseSlaMs: getSeverityResponseSlaMs(inc.severity),
    ageMs: Date.now() - new Date(inc.createdAt).getTime(),
  }));

  return NextResponse.json({
    tenantId,
    incidents: enriched,
    summary: {
      total: openIncidents.length,
      bySeverity,
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

  if (action === "create") {
    const { title, description, triggeredBy, affectedSystems, assignedTo, severity } =
      body as Record<string, unknown>;

    if (typeof title !== "string" || typeof description !== "string") {
      return NextResponse.json({ error: "title and description required" }, { status: 400 });
    }

    const validSeverities: IncidentSeverity[] = ["sev1", "sev2", "sev3", "sev4"];
    const resolvedSeverity: IncidentSeverity = validSeverities.includes(severity as IncidentSeverity)
      ? (severity as IncidentSeverity)
      : "sev3";

    const incident = await createIncident({
      title,
      description,
      severity: resolvedSeverity,
      tenantId,
      triggeredBy: typeof triggeredBy === "string" ? triggeredBy : "manual",
      affectedSystems: Array.isArray(affectedSystems) ? (affectedSystems as string[]) : [],
      assignedTo: typeof assignedTo === "string" ? assignedTo : undefined,
    });

    return NextResponse.json({ action: "create", incident, success: true }, { status: 201 });
  }

  if (action === "update") {
    const { incidentId, status, assignedTo, description } = body as Record<string, unknown>;

    if (typeof incidentId !== "string") {
      return NextResponse.json({ error: "incidentId required" }, { status: 400 });
    }

    const validStatuses: IncidentStatus[] = ["open", "investigating", "mitigating", "resolved", "closed"];
    const updates: Parameters<typeof updateIncident>[1] = {};
    if (validStatuses.includes(status as IncidentStatus)) updates.status = status as IncidentStatus;
    if (typeof assignedTo === "string") updates.assignedTo = assignedTo;
    if (typeof description === "string") updates.description = description;

    try {
      const updated = updateIncident(incidentId, updates);
      return NextResponse.json({ action: "update", incident: updated, success: true });
    } catch {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
  }

  if (action === "classify") {
    const input = body as Record<string, unknown>;
    const classification: ClassificationInput = {
      eventType: typeof input.eventType === "string" ? input.eventType : "unknown",
      queueDepth: typeof input.queueDepth === "number" ? input.queueDepth : 0,
      failureRate: typeof input.failureRate === "number" ? input.failureRate : 0,
      tenantTier: ["standard", "premium", "enterprise"].includes(input.tenantTier as string)
        ? (input.tenantTier as ClassificationInput["tenantTier"])
        : "standard",
      affectedTenantCount: typeof input.affectedTenantCount === "number" ? input.affectedTenantCount : 0,
      isPaymentRelated: input.isPaymentRelated === true,
    };

    const severity = classifySeverity(classification);
    return NextResponse.json({
      action: "classify",
      severity,
      label: getSeverityLabel(severity),
      responseSlaMs: getSeverityResponseSlaMs(severity),
    });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'create', 'update', or 'classify'.` },
    { status: 400 }
  );
}
