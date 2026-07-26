// GET  /api/admin/decision-intelligence — recent decisions, agent accuracy, escalation stats, interventions
// POST /api/admin/decision-intelligence — record_decision | record_outcome | record_escalation | resolve_escalation | record_intervention | resolve_intervention
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordDecision,
  recordOutcome,
  getDecisionsByAgent,
  getAgentAccuracy,
  getRecentDecisions,
} from "@/lib/decision-intelligence/decision-scorer";
import {
  recordEscalation,
  resolveEscalation,
  getUnnecessaryEscalations,
  getEscalationStats,
} from "@/lib/decision-intelligence/escalation-analyzer";
import {
  recordIntervention,
  resolveIntervention,
  type Intervention,
} from "@/lib/decision-intelligence/intervention-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INTERVENTION_TYPES: Intervention["interventionType"][] = [
  "override", "approval", "rollback", "escalation",
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
  const agentName = url.searchParams.get("agentName");
  const eventType = url.searchParams.get("eventType") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const recentDecisions = getRecentDecisions(limit);
  const unnecessaryEscalations = getUnnecessaryEscalations();
  const escalationStats = getEscalationStats(eventType);

  return NextResponse.json({
    decisions: {
      recent: recentDecisions,
      ...(agentName
        ? {
            byAgent: getDecisionsByAgent(agentName),
            agentAccuracy: getAgentAccuracy(agentName),
          }
        : {}),
    },
    escalations: {
      unnecessary: unnecessaryEscalations,
      stats: escalationStats,
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

  if (action === "record_decision") {
    const { agentName, eventType, decision, confidence } = body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof eventType !== "string" || typeof decision !== "string") {
      return NextResponse.json({ error: "agentName, eventType, and decision required" }, { status: 400 });
    }

    const record = recordDecision(
      agentName,
      eventType,
      tenantId,
      decision,
      typeof confidence === "number" ? confidence : 1
    );
    return NextResponse.json({ action: "record_decision", record, success: true }, { status: 201 });
  }

  if (action === "record_outcome") {
    const { id, outcome } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!["correct", "incorrect"].includes(outcome as string)) {
      return NextResponse.json({ error: "outcome must be 'correct' or 'incorrect'" }, { status: 400 });
    }
    recordOutcome(id, outcome as "correct" | "incorrect");
    return NextResponse.json({ action: "record_outcome", id, outcome, success: true });
  }

  if (action === "record_escalation") {
    const { eventType, escalatedTo, reason } = body as Record<string, unknown>;

    if (typeof eventType !== "string" || typeof escalatedTo !== "string") {
      return NextResponse.json({ error: "eventType and escalatedTo required" }, { status: 400 });
    }

    const analysis = recordEscalation(
      eventType,
      tenantId,
      escalatedTo,
      typeof reason === "string" ? reason : ""
    );
    return NextResponse.json({ action: "record_escalation", analysis, success: true }, { status: 201 });
  }

  if (action === "resolve_escalation") {
    const { id, resolutionTimeMs, wasNecessary } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    resolveEscalation(
      id,
      typeof resolutionTimeMs === "number" ? resolutionTimeMs : 0,
      wasNecessary === true
    );
    return NextResponse.json({ action: "resolve_escalation", id, success: true });
  }

  if (action === "record_intervention") {
    const { agentName, interventionType, trigger } = body as Record<string, unknown>;

    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (!VALID_INTERVENTION_TYPES.includes(interventionType as Intervention["interventionType"])) {
      return NextResponse.json(
        { error: `interventionType must be one of: ${VALID_INTERVENTION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const intervention = recordIntervention(
      agentName,
      tenantId,
      interventionType as Intervention["interventionType"],
      typeof trigger === "string" ? trigger : ""
    );
    return NextResponse.json({ action: "record_intervention", intervention, success: true }, { status: 201 });
  }

  if (action === "resolve_intervention") {
    const { id, effectMs, successful } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    resolveIntervention(
      id,
      typeof effectMs === "number" ? effectMs : 0,
      successful === true
    );
    return NextResponse.json({ action: "resolve_intervention", id, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_decision', 'record_outcome', 'record_escalation', 'resolve_escalation', 'record_intervention', or 'resolve_intervention'.`,
    },
    { status: 400 }
  );
}
