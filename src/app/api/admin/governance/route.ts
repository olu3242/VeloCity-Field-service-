// GET  /api/admin/governance — operator state, drift detection, circuit breakers
// POST /api/admin/governance — pause_runtime | resume_runtime | disable_agent | enable_agent
//                              | disable_event_type | enable_event_type | reset_circuit
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import {
  getOperatorState,
  pauseRuntime,
  resumeRuntime,
  disableAgent,
  enableAgent,
  disableEventType,
  enableEventType,
  isRuntimePaused,
  isAgentEnabled,
  isEventTypeEnabled,
} from "@/lib/governance/operator";
import { detectDrift, getDriftScore } from "@/lib/governance/drift-detector";
import { getAllCircuits, resetCircuit } from "@/lib/governance/circuit-breaker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const checkAgent = url.searchParams.get("checkAgent");
  const checkEvent = url.searchParams.get("checkEvent");

  const db = getAdminClient();
  const operatorState = getOperatorState();
  const drifts = await detectDrift(db, tenantId);
  const driftScore = getDriftScore(drifts);
  const circuits = getAllCircuits();

  const driftSummary = {
    total: drifts.length,
    score: driftScore,
    critical: drifts.filter((d) => d.severity === "critical").length,
    high: drifts.filter((d) => d.severity === "high").length,
    byCategory: drifts.reduce<Record<string, number>>((acc, d) => {
      acc[d.category] = (acc[d.category] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const circuitSummary = {
    total: circuits.length,
    open: circuits.filter((c) => c.state === "open").length,
    halfOpen: circuits.filter((c) => c.state === "half-open").length,
    closed: circuits.filter((c) => c.state === "closed").length,
  };

  return NextResponse.json({
    tenantId,
    operator: {
      ...operatorState,
      disabledAgents: Array.from(operatorState.disabledAgents),
      disabledEventTypes: Array.from(operatorState.disabledEventTypes),
      runtimePaused: isRuntimePaused(),
      ...(checkAgent ? { agentEnabled: isAgentEnabled(checkAgent) } : {}),
      ...(checkEvent ? { eventTypeEnabled: isEventTypeEnabled(checkEvent) } : {}),
    },
    drift: {
      items: drifts,
      summary: driftSummary,
    },
    circuits: {
      all: circuits,
      summary: circuitSummary,
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
  const adminId = auth.userId ?? "unknown";

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

  if (action === "pause_runtime") {
    const { reason } = body as Record<string, unknown>;
    if (typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    pauseRuntime(adminId, reason);
    return NextResponse.json({ action: "pause_runtime", adminId, reason, success: true });
  }

  if (action === "resume_runtime") {
    resumeRuntime(adminId);
    return NextResponse.json({ action: "resume_runtime", adminId, success: true });
  }

  if (action === "disable_agent") {
    const { agentName } = body as Record<string, unknown>;
    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    disableAgent(agentName);
    return NextResponse.json({ action: "disable_agent", agentName, success: true });
  }

  if (action === "enable_agent") {
    const { agentName } = body as Record<string, unknown>;
    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    enableAgent(agentName);
    return NextResponse.json({ action: "enable_agent", agentName, success: true });
  }

  if (action === "disable_event_type") {
    const { eventType } = body as Record<string, unknown>;
    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    disableEventType(eventType);
    return NextResponse.json({ action: "disable_event_type", eventType, success: true });
  }

  if (action === "enable_event_type") {
    const { eventType } = body as Record<string, unknown>;
    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    enableEventType(eventType);
    return NextResponse.json({ action: "enable_event_type", eventType, success: true });
  }

  if (action === "reset_circuit") {
    const { circuitKey } = body as Record<string, unknown>;
    if (typeof circuitKey !== "string") {
      return NextResponse.json({ error: "circuitKey required" }, { status: 400 });
    }
    resetCircuit(circuitKey);
    return NextResponse.json({ action: "reset_circuit", circuitKey, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'pause_runtime', 'resume_runtime', 'disable_agent', 'enable_agent', 'disable_event_type', 'enable_event_type', or 'reset_circuit'.`,
    },
    { status: 400 }
  );
}
