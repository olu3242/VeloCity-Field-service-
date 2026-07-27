// GET  /api/admin/coordination — routing stats/history, open proposals, delegation chains, escalation routes
// POST /api/admin/coordination — route_task | propose_consensus | cast_vote | evaluate_proposal
//                                | create_delegation_chain | advance_step
//                                | register_escalation_route | update_escalation_route | resolve_escalation
// Admin-only; tenant-scoped. Governs multi-agent task routing, voting, delegation, and escalation.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  routeTask,
  getRoutingHistory,
  getRoutingStats,
} from "@/lib/coordination/task-router";
import {
  proposeConsensus,
  castVote,
  evaluateProposal,
  getOpenProposals,
  getConsensusStats,
  PROPOSALS,
} from "@/lib/coordination/consensus-handler";
import {
  createDelegationChain,
  advanceStep,
  getDelegationChain,
  getActiveDelegations,
  getDelegationStats,
} from "@/lib/coordination/orchestration-delegate";
import {
  registerEscalationRoute,
  resolveEscalation,
  updateEscalationRoute,
  getAllEscalationRoutes,
  type EscalationRoute,
  type EscalationTarget,
} from "@/lib/coordination/adaptive-escalation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_VOTES = ["approve", "reject", "abstain"] as const;
const VALID_URGENCIES: EscalationRoute["urgency"][] = ["low", "medium", "high", "critical"];
const VALID_TARGETS: EscalationTarget[] = [
  "ai_agent", "human_review", "automated_resolution", "emergency_escalation",
];
const VALID_STEP_STATUSES = ["completed", "failed"] as const;

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
  const sourceAgent = url.searchParams.get("sourceAgent");
  const rootTaskId = url.searchParams.get("rootTaskId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    routing: {
      stats: getRoutingStats(),
      history: getRoutingHistory(sourceAgent ?? undefined, limit),
    },
    consensus: {
      open: getOpenProposals(),
      stats: getConsensusStats(),
    },
    delegation: {
      active: getActiveDelegations(),
      stats: getDelegationStats(),
      ...(rootTaskId ? { chain: getDelegationChain(rootTaskId) ?? null } : {}),
    },
    escalation: {
      routes: getAllEscalationRoutes(),
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

  if (action === "route_task") {
    const { taskId, sourceAgent, taskType, priority } = body as Record<string, unknown>;
    if (typeof taskId !== "string" || typeof sourceAgent !== "string" || typeof taskType !== "string") {
      return NextResponse.json(
        { error: "taskId, sourceAgent, and taskType required" },
        { status: 400 }
      );
    }
    const decision = routeTask(
      taskId,
      sourceAgent,
      taskType,
      typeof priority === "number" ? priority : 50,
      tenantId
    );
    return NextResponse.json({ action: "route_task", decision, success: true }, { status: 201 });
  }

  if (action === "propose_consensus") {
    const { topic, proposedBy, threshold, ttlMs } = body as Record<string, unknown>;
    if (typeof topic !== "string" || topic.trim() === "") {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    if (typeof proposedBy !== "string" || proposedBy.trim() === "") {
      return NextResponse.json({ error: "proposedBy required" }, { status: 400 });
    }
    if (threshold !== undefined && (typeof threshold !== "number" || threshold <= 0 || threshold > 1)) {
      return NextResponse.json({ error: "threshold must be between 0 and 1" }, { status: 400 });
    }
    const proposal = proposeConsensus(
      topic,
      proposedBy,
      typeof threshold === "number" ? threshold : undefined,
      typeof ttlMs === "number" ? ttlMs : undefined
    );
    return NextResponse.json({ action: "propose_consensus", proposal, success: true }, { status: 201 });
  }

  if (action === "cast_vote") {
    const { proposalId, agentName, vote, reason } = body as Record<string, unknown>;
    if (typeof proposalId !== "string" || typeof agentName !== "string") {
      return NextResponse.json({ error: "proposalId and agentName required" }, { status: 400 });
    }
    if (!VALID_VOTES.includes(vote as (typeof VALID_VOTES)[number])) {
      return NextResponse.json(
        { error: `vote must be one of: ${VALID_VOTES.join(", ")}` },
        { status: 400 }
      );
    }
    // castVote throws on an unknown proposal — check first so callers get 404, not 500.
    if (!PROPOSALS.has(proposalId)) {
      return NextResponse.json({ error: `Unknown proposalId: ${proposalId}` }, { status: 404 });
    }
    const proposal = castVote(
      proposalId,
      agentName,
      vote as (typeof VALID_VOTES)[number],
      typeof reason === "string" ? reason : undefined
    );
    return NextResponse.json({ action: "cast_vote", proposal, success: true });
  }

  if (action === "evaluate_proposal") {
    const { proposalId } = body as Record<string, unknown>;
    if (typeof proposalId !== "string") {
      return NextResponse.json({ error: "proposalId required" }, { status: 400 });
    }
    if (!PROPOSALS.has(proposalId)) {
      return NextResponse.json({ error: `Unknown proposalId: ${proposalId}` }, { status: 404 });
    }
    const proposal = evaluateProposal(proposalId);
    return NextResponse.json({ action: "evaluate_proposal", proposal, success: true });
  }

  if (action === "create_delegation_chain") {
    const { rootTaskId, rootAgent, steps } = body as Record<string, unknown>;
    if (typeof rootTaskId !== "string" || typeof rootAgent !== "string") {
      return NextResponse.json({ error: "rootTaskId and rootAgent required" }, { status: 400 });
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "steps must be a non-empty array" }, { status: 400 });
    }

    const parsedSteps: { agentName: string; taskType: string }[] = [];
    for (const raw of steps) {
      if (!raw || typeof raw !== "object") {
        return NextResponse.json(
          { error: "each step must be an object with agentName and taskType" },
          { status: 400 }
        );
      }
      const s = raw as Record<string, unknown>;
      if (typeof s.agentName !== "string" || typeof s.taskType !== "string") {
        return NextResponse.json(
          { error: "each step requires string agentName and taskType" },
          { status: 400 }
        );
      }
      parsedSteps.push({ agentName: s.agentName, taskType: s.taskType });
    }

    const chain = createDelegationChain(rootTaskId, rootAgent, parsedSteps);
    return NextResponse.json({ action: "create_delegation_chain", chain, success: true }, { status: 201 });
  }

  if (action === "advance_step") {
    const { rootTaskId, stepId, status, error } = body as Record<string, unknown>;
    if (typeof rootTaskId !== "string" || typeof stepId !== "string") {
      return NextResponse.json({ error: "rootTaskId and stepId required" }, { status: 400 });
    }
    if (!VALID_STEP_STATUSES.includes(status as (typeof VALID_STEP_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STEP_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const chain = getDelegationChain(rootTaskId);
    if (!chain) {
      return NextResponse.json({ error: `Unknown rootTaskId: ${rootTaskId}` }, { status: 404 });
    }
    if (!chain.steps.some((s) => s.stepId === stepId)) {
      return NextResponse.json({ error: `Unknown stepId: ${stepId}` }, { status: 404 });
    }
    advanceStep(
      rootTaskId,
      stepId,
      status as (typeof VALID_STEP_STATUSES)[number],
      typeof error === "string" ? error : undefined
    );
    return NextResponse.json({
      action: "advance_step",
      chain: getDelegationChain(rootTaskId),
      success: true,
    });
  }

  if (action === "register_escalation_route" || action === "update_escalation_route") {
    const { eventType, urgency, target, agentHint, maxWaitMs, reason } =
      body as Record<string, unknown>;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!VALID_URGENCIES.includes(urgency as EscalationRoute["urgency"])) {
      return NextResponse.json(
        { error: `urgency must be one of: ${VALID_URGENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    if (action === "update_escalation_route") {
      const updates: Partial<EscalationRoute> = {
        ...(VALID_TARGETS.includes(target as EscalationTarget)
          ? { target: target as EscalationTarget }
          : {}),
        ...(typeof agentHint === "string" ? { agentHint } : {}),
        ...(typeof maxWaitMs === "number" ? { maxWaitMs } : {}),
        ...(typeof reason === "string" ? { reason } : {}),
      };
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: "at least one updatable field required (target, agentHint, maxWaitMs, reason)" },
          { status: 400 }
        );
      }
      updateEscalationRoute(eventType, urgency as EscalationRoute["urgency"], updates);
      return NextResponse.json({
        action: "update_escalation_route",
        route: resolveEscalation(eventType, urgency as EscalationRoute["urgency"]),
        success: true,
      });
    }

    if (!VALID_TARGETS.includes(target as EscalationTarget)) {
      return NextResponse.json(
        { error: `target must be one of: ${VALID_TARGETS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const route: EscalationRoute = {
      eventType,
      urgency: urgency as EscalationRoute["urgency"],
      target: target as EscalationTarget,
      maxWaitMs: typeof maxWaitMs === "number" ? maxWaitMs : 60_000,
      reason,
      ...(typeof agentHint === "string" ? { agentHint } : {}),
    };
    registerEscalationRoute(route);
    return NextResponse.json({ action: "register_escalation_route", route, success: true }, { status: 201 });
  }

  if (action === "resolve_escalation") {
    const { eventType, urgency } = body as Record<string, unknown>;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!VALID_URGENCIES.includes(urgency as EscalationRoute["urgency"])) {
      return NextResponse.json(
        { error: `urgency must be one of: ${VALID_URGENCIES.join(", ")}` },
        { status: 400 }
      );
    }
    const route = resolveEscalation(eventType, urgency as EscalationRoute["urgency"]);
    return NextResponse.json({ action: "resolve_escalation", route, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'route_task', 'propose_consensus', 'cast_vote', 'evaluate_proposal', 'create_delegation_chain', 'advance_step', 'register_escalation_route', 'update_escalation_route', or 'resolve_escalation'.`,
    },
    { status: 400 }
  );
}
