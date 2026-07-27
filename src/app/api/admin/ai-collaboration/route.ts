// GET  /api/admin/ai-collaboration — this tenant's delegations, negotiations, shared contexts
// POST /api/admin/ai-collaboration — delegate | resolve_delegate | delegations_by_agent
//                                    | propose_negotiation | cast_vote | evaluate_negotiation
//                                    | create_shared_context | update_shared_context | get_shared_context
// Admin-only. Delegations, negotiations and shared contexts all carry a tenantId. Their
// mutators take no tenant argument and no-op (or throw) on unknown ids, so ownership is
// verified at the route layer before every write.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { isRuntimePaused } from "@/lib/governance/operator";
import {
  DELEGATIONS,
  delegate,
  resolveDelegate,
  getDelegationsByAgent,
  getDelegationStats,
} from "@/lib/ai-collaboration/delegation-router";
import {
  NEGOTIATIONS,
  proposeNegotiation,
  castVote,
  evaluateNegotiation,
  getActiveNegotiations,
} from "@/lib/ai-collaboration/negotiation-log";
import {
  createSharedContext,
  updateSharedContext,
  getSharedContext,
  getContextsByTenant,
} from "@/lib/ai-collaboration/shared-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DELEGATION_OUTCOMES = ["accepted", "rejected", "completed"] as const;
const VALID_VOTES = ["agree", "disagree", "abstain"] as const;

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
  const agentName = url.searchParams.get("agentName");
  const sessionId = url.searchParams.get("sessionId");

  const context = sessionId ? getSharedContext(sessionId) : undefined;

  return NextResponse.json({
    delegations: {
      // DELEGATIONS is the raw store — scope it to this tenant.
      all: DELEGATIONS.filter((d) => d.tenantId === tenantId),
      ...(agentName
        ? {
            byAgent: getDelegationsByAgent(agentName).filter((d) => d.tenantId === tenantId),
          }
        : {}),
      ...(isSuperAdmin ? { platformStats: getDelegationStats() } : {}),
    },
    negotiations: {
      active: getActiveNegotiations().filter((n) => n.tenantId === tenantId),
      all: NEGOTIATIONS.filter((n) => n.tenantId === tenantId),
    },
    sharedContexts: {
      all: getContextsByTenant(tenantId),
      ...(sessionId
        ? { context: context && context.tenantId === tenantId ? context : null }
        : {}),
    },
    runtimePaused: isRuntimePaused(),
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

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Delegation router ───────────────────────────────────────────────────

  if (action === "delegate") {
    const { fromAgent, toAgent, taskType, reason } = raw;
    if (typeof fromAgent !== "string" || typeof toAgent !== "string") {
      return NextResponse.json({ error: "fromAgent and toAgent required" }, { status: 400 });
    }
    if (fromAgent === toAgent) {
      return NextResponse.json({ error: "An agent cannot delegate to itself" }, { status: 400 });
    }
    if (typeof taskType !== "string" || taskType.trim() === "") {
      return NextResponse.json({ error: "taskType required" }, { status: 400 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const record = delegate(fromAgent, toAgent, tenantId, taskType, reason);
    // While the runtime is paused the router records the delegation as already
    // rejected — surface that as 409 rather than a queued handoff.
    const blocked = record.status === "rejected";
    return NextResponse.json(
      {
        action: "delegate",
        record,
        ...(blocked ? { error: "Runtime is paused — delegation was rejected" } : {}),
        success: !blocked,
      },
      { status: blocked ? 409 : 201 }
    );
  }

  if (action === "resolve_delegate") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const record = DELEGATIONS.find((d) => d.id === id && d.tenantId === tenantId);
    if (!record) {
      return NextResponse.json({ error: "Delegation not found for this tenant" }, { status: 404 });
    }
    if (record.status !== "pending") {
      return NextResponse.json(
        { error: `Delegation is '${record.status}' — only pending delegations can be resolved` },
        { status: 409 }
      );
    }
    if (!VALID_DELEGATION_OUTCOMES.includes(status as (typeof VALID_DELEGATION_OUTCOMES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_DELEGATION_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    resolveDelegate(id, status as (typeof VALID_DELEGATION_OUTCOMES)[number]);
    return NextResponse.json({
      action: "resolve_delegate",
      record: DELEGATIONS.find((d) => d.id === id) ?? null,
      success: true,
    });
  }

  if (action === "delegations_by_agent") {
    const { agentName } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "delegations_by_agent",
      records: getDelegationsByAgent(agentName).filter((d) => d.tenantId === tenantId),
      success: true,
    });
  }

  // ── Negotiation log ─────────────────────────────────────────────────────

  if (action === "propose_negotiation") {
    const { sessionId, agents, proposal } = raw;
    if (typeof sessionId !== "string" || sessionId.trim() === "") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    if (!Array.isArray(agents) || agents.length < 2) {
      return NextResponse.json(
        { error: "agents must contain at least two participants" },
        { status: 400 }
      );
    }
    if (!agents.every((a) => typeof a === "string")) {
      return NextResponse.json({ error: "agents must contain only strings" }, { status: 400 });
    }
    if (typeof proposal !== "string" || proposal.trim() === "") {
      return NextResponse.json({ error: "proposal required" }, { status: 400 });
    }
    const entry = proposeNegotiation(sessionId, tenantId, agents as string[], proposal);
    return NextResponse.json({ action: "propose_negotiation", entry, success: true }, { status: 201 });
  }

  if (action === "cast_vote") {
    const { id, agentName, vote } = raw;
    if (typeof id !== "string" || typeof agentName !== "string") {
      return NextResponse.json({ error: "id and agentName required" }, { status: 400 });
    }
    const entry = NEGOTIATIONS.find((n) => n.id === id && n.tenantId === tenantId);
    if (!entry) {
      return NextResponse.json({ error: "Negotiation not found for this tenant" }, { status: 404 });
    }
    if (entry.outcome !== "pending") {
      return NextResponse.json(
        { error: `Negotiation is already '${entry.outcome}' and cannot accept further votes` },
        { status: 409 }
      );
    }
    // Votes are keyed by agent name, so a non-participant would otherwise be able
    // to add a vote that counts toward consensus.
    if (!entry.agents.includes(agentName)) {
      return NextResponse.json(
        { error: `Agent '${agentName}' is not a participant in this negotiation` },
        { status: 403 }
      );
    }
    if (!VALID_VOTES.includes(vote as (typeof VALID_VOTES)[number])) {
      return NextResponse.json(
        { error: `vote must be one of: ${VALID_VOTES.join(", ")}` },
        { status: 400 }
      );
    }
    castVote(id, agentName, vote as (typeof VALID_VOTES)[number]);
    return NextResponse.json({
      action: "cast_vote",
      entry: NEGOTIATIONS.find((n) => n.id === id) ?? null,
      success: true,
    });
  }

  if (action === "evaluate_negotiation") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // evaluateNegotiation throws on an unknown id — check first so callers get 404.
    const existing = NEGOTIATIONS.find((n) => n.id === id && n.tenantId === tenantId);
    if (!existing) {
      return NextResponse.json({ error: "Negotiation not found for this tenant" }, { status: 404 });
    }
    const entry = evaluateNegotiation(id);
    return NextResponse.json({
      action: "evaluate_negotiation",
      entry,
      // With zero votes the evaluator records "rejected"; flag that so an
      // un-voted proposal is not read as a genuine rejection.
      ...(Object.keys(entry.votes).length === 0
        ? { note: "No votes were cast — outcome defaulted to rejected." }
        : {}),
      success: true,
    });
  }

  // ── Shared context ──────────────────────────────────────────────────────

  if (action === "create_shared_context") {
    const { sessionId, participants, contextData } = raw;
    if (typeof sessionId !== "string" || sessionId.trim() === "") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: "participants must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!participants.every((p) => typeof p === "string")) {
      return NextResponse.json({ error: "participants must contain only strings" }, { status: 400 });
    }
    // Contexts are keyed by sessionId alone, so creating over an existing session
    // would replace another tenant's context wholesale.
    const existing = getSharedContext(sessionId);
    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.tenantId === tenantId
              ? `Shared context for session '${sessionId}' already exists`
              : "Shared context not found for this tenant",
        },
        { status: existing.tenantId === tenantId ? 409 : 404 }
      );
    }
    const context = createSharedContext(
      sessionId,
      tenantId,
      participants as string[],
      contextData && typeof contextData === "object"
        ? (contextData as Record<string, unknown>)
        : {}
    );
    return NextResponse.json({ action: "create_shared_context", context, success: true }, { status: 201 });
  }

  if (action === "update_shared_context" || action === "get_shared_context") {
    const { sessionId, patch } = raw;
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const context = getSharedContext(sessionId);
    if (!context || context.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Shared context not found for this tenant" },
        { status: 404 }
      );
    }
    if (action === "get_shared_context") {
      return NextResponse.json({ action: "get_shared_context", context, success: true });
    }
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "patch object required" }, { status: 400 });
    }
    updateSharedContext(sessionId, patch as Record<string, unknown>);
    return NextResponse.json({
      action: "update_shared_context",
      context: getSharedContext(sessionId) ?? null,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'delegate', 'resolve_delegate', 'delegations_by_agent', 'propose_negotiation', 'cast_vote', 'evaluate_negotiation', 'create_shared_context', 'update_shared_context', or 'get_shared_context'.`,
    },
    { status: 400 }
  );
}
