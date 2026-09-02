// GET  /api/admin/agents — agent registry, active agents, agents by event
// POST /api/admin/agents — run_agent
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  AGENT_REGISTRY,
  getActiveAgents,
  getAgentsByEvent,
  getAgent,
} from "@/lib/agents/registry";
import { runAgent } from "@/lib/agents/runAgent";
import type { AgentName } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_AGENT_NAMES: AgentName[] = [
  "ALICE", "MAX", "QUINN", "NOVA", "REX", "IVY", "FINN", "LENA", "TESS", "GABRIEL",
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
  const eventFilter = url.searchParams.get("event");
  const nameFilter = url.searchParams.get("name") as AgentName | null;

  if (nameFilter) {
    if (!VALID_AGENT_NAMES.includes(nameFilter)) {
      return NextResponse.json({ error: `Unknown agent name: ${nameFilter}` }, { status: 400 });
    }
    const registration = getAgent(nameFilter);
    return NextResponse.json({ agent: registration });
  }

  const activeAgents = getActiveAgents();
  const byEvent = eventFilter ? getAgentsByEvent(eventFilter) : null;

  const summary = {
    total: Object.keys(AGENT_REGISTRY).length,
    active: activeAgents.length,
    byCapabilityType: Object.values(AGENT_REGISTRY).reduce<Record<string, number>>((acc, a) => {
      acc[a.capability_type] = (acc[a.capability_type] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return NextResponse.json({
    agents: eventFilter ? byEvent : Object.values(AGENT_REGISTRY),
    active: activeAgents,
    summary,
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

  if (action === "run_agent") {
    const { agentName, input } = body as Record<string, unknown>;

    if (!VALID_AGENT_NAMES.includes(agentName as AgentName)) {
      return NextResponse.json(
        { error: `agentName must be one of: ${VALID_AGENT_NAMES.join(", ")}` },
        { status: 400 }
      );
    }

    const agentInput: Record<string, unknown> = {
      tenantId,
      ...((input && typeof input === "object") ? (input as Record<string, unknown>) : {}),
    };

    const result = await runAgent(agentName as AgentName, agentInput);
    return NextResponse.json({ action: "run_agent", agentName, result, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'run_agent'.` },
    { status: 400 }
  );
}
