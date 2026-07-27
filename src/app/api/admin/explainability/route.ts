// GET  /api/admin/explainability — decision traces, reasoning log, audit narratives
// POST /api/admin/explainability — start_trace | add_step | complete_trace | log_reasoning | generate_narrative
// Admin-only; tenant-scoped. Provides AI decision transparency for governance and audit review.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  startTrace,
  addStep,
  completeTrace,
  getTrace,
  getTracesByAgent,
} from "@/lib/explainability/decision-trace";
import {
  logReasoning,
  getReasoningByAgent,
  getReasoningByDecision,
  getRecentReasoning,
  searchReasoning,
} from "@/lib/explainability/reasoning-log";
import {
  generateNarrative,
  getRecentNarratives,
  exportNarrativesForTenant,
} from "@/lib/explainability/audit-narrative";

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
  const agentName = url.searchParams.get("agentName");
  const traceId = url.searchParams.get("traceId");
  const decision = url.searchParams.get("decision");
  const query = url.searchParams.get("query");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    traces: {
      ...(traceId ? { trace: getTrace(traceId) ?? null } : {}),
      ...(agentName ? { byAgent: getTracesByAgent(agentName, limit) } : {}),
    },
    reasoning: {
      recent: getRecentReasoning(limit),
      ...(agentName ? { byAgent: getReasoningByAgent(agentName, limit) } : {}),
      ...(decision ? { byDecision: getReasoningByDecision(decision, limit) } : {}),
      ...(query ? { search: searchReasoning(query) } : {}),
    },
    narratives: {
      recent: getRecentNarratives(agentName ?? undefined, limit),
      tenantExport: exportNarrativesForTenant(tenantId),
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

  if (action === "start_trace") {
    const { agentName, eventType, inputSummary } = body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof eventType !== "string" || typeof inputSummary !== "string") {
      return NextResponse.json(
        { error: "agentName, eventType, and inputSummary required" },
        { status: 400 }
      );
    }
    const trace = startTrace(agentName, eventType, inputSummary, tenantId);
    return NextResponse.json({ action: "start_trace", trace, success: true }, { status: 201 });
  }

  if (action === "add_step") {
    const { traceId, step, result, confidenceDelta } = body as Record<string, unknown>;
    if (typeof traceId !== "string" || typeof step !== "string" || typeof result !== "string") {
      return NextResponse.json({ error: "traceId, step, and result required" }, { status: 400 });
    }
    if (!getTrace(traceId)) {
      return NextResponse.json({ error: `Unknown traceId: ${traceId}` }, { status: 404 });
    }
    addStep(traceId, step, result, typeof confidenceDelta === "number" ? confidenceDelta : 0);
    return NextResponse.json({ action: "add_step", trace: getTrace(traceId), success: true });
  }

  if (action === "complete_trace") {
    const { traceId, finalDecision, finalConfidence } = body as Record<string, unknown>;
    if (typeof traceId !== "string" || typeof finalDecision !== "string") {
      return NextResponse.json({ error: "traceId and finalDecision required" }, { status: 400 });
    }
    if (!getTrace(traceId)) {
      return NextResponse.json({ error: `Unknown traceId: ${traceId}` }, { status: 404 });
    }
    completeTrace(traceId, finalDecision, typeof finalConfidence === "number" ? finalConfidence : 0);
    return NextResponse.json({ action: "complete_trace", trace: getTrace(traceId), success: true });
  }

  if (action === "log_reasoning") {
    const { agentName, eventType, decision, reasoning, confidence, evidenceKeys } =
      body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof eventType !== "string" || typeof decision !== "string") {
      return NextResponse.json(
        { error: "agentName, eventType, and decision required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(reasoning) || reasoning.length === 0) {
      return NextResponse.json({ error: "reasoning must be a non-empty array" }, { status: 400 });
    }
    const entry = logReasoning({
      agentName,
      eventType,
      tenantId,
      decision,
      reasoning: reasoning as string[],
      confidence: typeof confidence === "number" ? confidence : 0.5,
      evidenceKeys: Array.isArray(evidenceKeys) ? (evidenceKeys as string[]) : [],
    });
    return NextResponse.json({ action: "log_reasoning", entry, success: true }, { status: 201 });
  }

  if (action === "generate_narrative") {
    const { agentName, eventType, decision, reasoning, confidence, actionTaken } =
      body as Record<string, unknown>;
    if (
      typeof agentName !== "string" ||
      typeof eventType !== "string" ||
      typeof decision !== "string" ||
      typeof actionTaken !== "string"
    ) {
      return NextResponse.json(
        { error: "agentName, eventType, decision, and actionTaken required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(reasoning) || reasoning.length === 0) {
      return NextResponse.json({ error: "reasoning must be a non-empty array" }, { status: 400 });
    }
    const narrative = generateNarrative({
      agentName,
      eventType,
      decision,
      reasoning: reasoning as string[],
      confidence: typeof confidence === "number" ? confidence : 0.5,
      tenantId,
      actionTaken,
    });
    return NextResponse.json({ action: "generate_narrative", narrative, success: true }, { status: 201 });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'start_trace', 'add_step', 'complete_trace', 'log_reasoning', or 'generate_narrative'.`,
    },
    { status: 400 }
  );
}
