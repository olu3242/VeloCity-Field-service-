// GET  /api/admin/agent-council — council summary, agents by tier, pending proposals, task queue
// POST /api/admin/agent-council — register_agent | update_status | propose | approve | reject | execute_proposal | schedule_task | start_task | complete_task | fail_task
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerCouncilAgent, updateAgentStatus, recordAgentDecision,
  getAgentsByTier, getAvailableAgents, getAllAgents, getCouncilSummary,
  type CouncilTier, type AgentStatus,
} from "@/lib/agent-council/council-registry";
import {
  proposeAction, approveProposal, rejectProposal, markProposalExecuted,
  getPendingProposals, getApprovedProposals, getProposalHistory, getProposalStats,
  type RiskLevel,
} from "@/lib/agent-council/governance-protocol";
import {
  scheduleAutonomousTask, startTask, completeTask, failTask, cancelTask,
  getTaskQueue, getRunningTasks, getCompletedTasks, getExecutorStats,
} from "@/lib/agent-council/autonomous-executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TIERS: CouncilTier[] = ["strategic", "operational", "commercial", "governance", "platform", "knowledge"];
const VALID_STATUSES: AgentStatus[] = ["available", "busy", "offline", "suspended"];
const VALID_RISK: RiskLevel[] = ["low", "medium", "high", "critical"];

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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const tier = url.searchParams.get("tier") as CouncilTier | null;
  const historyLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    council: getCouncilSummary(),
    agents: tier && VALID_TIERS.includes(tier) ? getAgentsByTier(tier) : getAllAgents(),
    available: getAvailableAgents(tier && VALID_TIERS.includes(tier) ? tier : undefined),
    proposals: {
      pending: getPendingProposals(tenantId),
      approved: getApprovedProposals(),
      history: getProposalHistory(historyLimit),
      stats: getProposalStats(),
    },
    tasks: {
      queue: getTaskQueue(tenantId),
      running: getRunningTasks(),
      recent: getCompletedTasks(20),
      stats: getExecutorStats(),
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "register_agent") {
    const { name, tier, capabilities } = body as Record<string, unknown>;
    if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!VALID_TIERS.includes(tier as CouncilTier)) return NextResponse.json({ error: `tier must be one of: ${VALID_TIERS.join(", ")}` }, { status: 400 });
    const agent = registerCouncilAgent(name, tier as CouncilTier, Array.isArray(capabilities) ? capabilities as string[] : []);
    return NextResponse.json({ action, agent, success: true }, { status: 201 });
  }

  if (action === "update_status") {
    const { agentId, status, load } = body as Record<string, unknown>;
    if (typeof agentId !== "string") return NextResponse.json({ error: "agentId required" }, { status: 400 });
    if (!VALID_STATUSES.includes(status as AgentStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    updateAgentStatus(agentId, status as AgentStatus, typeof load === "number" ? load : undefined);
    return NextResponse.json({ action, agentId, status, success: true });
  }

  if (action === "record_decision") {
    const { agentId } = body as Record<string, unknown>;
    if (typeof agentId !== "string") return NextResponse.json({ error: "agentId required" }, { status: 400 });
    recordAgentDecision(agentId);
    return NextResponse.json({ action, agentId, success: true });
  }

  if (action === "propose") {
    const { proposedBy, proposalAction, description, riskLevel, estimatedImpact, simulationResult } = body as Record<string, unknown>;
    if (typeof proposedBy !== "string" || typeof proposalAction !== "string") return NextResponse.json({ error: "proposedBy and proposalAction required" }, { status: 400 });
    if (!VALID_RISK.includes(riskLevel as RiskLevel)) return NextResponse.json({ error: `riskLevel must be one of: ${VALID_RISK.join(", ")}` }, { status: 400 });
    const proposal = proposeAction({
      action: proposalAction,
      description: typeof description === "string" ? description : proposalAction,
      proposedBy,
      riskLevel: riskLevel as RiskLevel,
      estimatedImpact: typeof estimatedImpact === "string" ? estimatedImpact : "unknown",
      simulationResult: typeof simulationResult === "string" ? simulationResult : undefined,
      tenantId,
    });
    return NextResponse.json({ action, proposal, success: true }, { status: 201 });
  }

  if (action === "approve") {
    const { proposalId, agentId } = body as Record<string, unknown>;
    if (typeof proposalId !== "string" || typeof agentId !== "string") return NextResponse.json({ error: "proposalId and agentId required" }, { status: 400 });
    const proposal = approveProposal(proposalId, agentId);
    if (!proposal) return NextResponse.json({ error: `Proposal '${proposalId}' not found or not pending` }, { status: 404 });
    return NextResponse.json({ action, proposal, success: true });
  }

  if (action === "reject") {
    const { proposalId, agentId, reason } = body as Record<string, unknown>;
    if (typeof proposalId !== "string" || typeof agentId !== "string") return NextResponse.json({ error: "proposalId and agentId required" }, { status: 400 });
    const proposal = rejectProposal(proposalId, agentId, typeof reason === "string" ? reason : "no reason given");
    if (!proposal) return NextResponse.json({ error: `Proposal '${proposalId}' not found or not pending` }, { status: 404 });
    return NextResponse.json({ action, proposal, success: true });
  }

  if (action === "execute_proposal") {
    const { proposalId } = body as Record<string, unknown>;
    if (typeof proposalId !== "string") return NextResponse.json({ error: "proposalId required" }, { status: 400 });
    const proposal = markProposalExecuted(proposalId);
    if (!proposal) return NextResponse.json({ error: `Proposal '${proposalId}' not found or not approved` }, { status: 409 });
    return NextResponse.json({ action, proposal, success: true });
  }

  if (action === "schedule_task") {
    const { proposalId, taskType, assignedAgent, priority } = body as Record<string, unknown>;
    if (typeof proposalId !== "string" || typeof taskType !== "string" || typeof assignedAgent !== "string") {
      return NextResponse.json({ error: "proposalId, taskType, and assignedAgent required" }, { status: 400 });
    }
    const task = scheduleAutonomousTask({ proposalId, taskType, assignedAgent, tenantId, priority: typeof priority === "number" ? priority : undefined });
    return NextResponse.json({ action, task, success: true }, { status: 201 });
  }

  if (action === "start_task") {
    const { taskId } = body as Record<string, unknown>;
    if (typeof taskId !== "string") return NextResponse.json({ error: "taskId required" }, { status: 400 });
    startTask(taskId);
    return NextResponse.json({ action, taskId, success: true });
  }

  if (action === "complete_task") {
    const { taskId, outcome } = body as Record<string, unknown>;
    if (typeof taskId !== "string") return NextResponse.json({ error: "taskId required" }, { status: 400 });
    completeTask(taskId, typeof outcome === "string" ? outcome : "completed");
    return NextResponse.json({ action, taskId, success: true });
  }

  if (action === "fail_task") {
    const { taskId, reason } = body as Record<string, unknown>;
    if (typeof taskId !== "string") return NextResponse.json({ error: "taskId required" }, { status: 400 });
    failTask(taskId, typeof reason === "string" ? reason : "failed");
    return NextResponse.json({ action, taskId, success: true });
  }

  if (action === "cancel_task") {
    const { taskId } = body as Record<string, unknown>;
    if (typeof taskId !== "string") return NextResponse.json({ error: "taskId required" }, { status: 400 });
    cancelTask(taskId);
    return NextResponse.json({ action, taskId, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'register_agent', 'update_status', 'record_decision', 'propose', 'approve', 'reject', 'execute_proposal', 'schedule_task', 'start_task', 'complete_task', 'fail_task', or 'cancel_task'.` }, { status: 400 });
}
