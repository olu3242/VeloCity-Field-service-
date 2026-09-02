// GET  /api/admin/swarm-coordination — swarm stats, available agents, pending consensus, unassigned tasks
// POST /api/admin/swarm-coordination — register_agent | update_load | create_task | assign_task | complete_task | distribute_task | initiate_consensus | cast_vote | evaluate_consensus
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerSwarmAgent,
  updateAgentLoad,
  getAvailableAgents,
  getOverloadedAgents,
  getSwarmStats,
  type SwarmAgent,
} from "@/lib/swarm-coordination/swarm-registry";
import {
  createTask,
  assignTask,
  completeTask,
  getUnassignedTasks,
  distributeToLeastLoaded,
} from "@/lib/swarm-coordination/task-distributor";
import {
  initiateConsensus,
  castConsensusVote,
  evaluateConsensus,
  getPendingConsensus,
} from "@/lib/swarm-coordination/consensus-coordinator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ROLES: SwarmAgent["role"][] = ["leader", "worker", "specialist", "observer"];

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
  const role = url.searchParams.get("role") as SwarmAgent["role"] | null;

  const swarmStats = getSwarmStats();
  const availableAgents = getAvailableAgents(
    role && VALID_ROLES.includes(role) ? role : undefined
  );
  const overloadedAgents = getOverloadedAgents();
  const unassignedTasks = getUnassignedTasks();
  const pendingConsensus = getPendingConsensus();

  return NextResponse.json({
    swarm: {
      stats: swarmStats,
      available: availableAgents,
      overloaded: overloadedAgents,
    },
    tasks: {
      unassigned: unassignedTasks,
      count: unassignedTasks.length,
    },
    consensus: {
      pending: pendingConsensus,
      count: pendingConsensus.length,
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

  if (action === "register_agent") {
    const { agentName, role } = body as Record<string, unknown>;
    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role as SwarmAgent["role"])) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    const agent = registerSwarmAgent(agentName, role as SwarmAgent["role"], tenantId);
    return NextResponse.json({ action: "register_agent", agent, success: true }, { status: 201 });
  }

  if (action === "update_load") {
    const { agentId, currentLoad, assignedTasks } = body as Record<string, unknown>;
    if (typeof agentId !== "string") {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }
    updateAgentLoad(
      agentId,
      typeof currentLoad === "number" ? currentLoad : 0,
      typeof assignedTasks === "number" ? assignedTasks : 0
    );
    return NextResponse.json({ action: "update_load", agentId, success: true });
  }

  if (action === "create_task") {
    const { taskType, priority } = body as Record<string, unknown>;
    if (typeof taskType !== "string") {
      return NextResponse.json({ error: "taskType required" }, { status: 400 });
    }
    const task = createTask(
      taskType,
      typeof priority === "number" ? priority : 5,
      tenantId
    );
    return NextResponse.json({ action: "create_task", task, success: true }, { status: 201 });
  }

  if (action === "assign_task") {
    const { taskId, agentId } = body as Record<string, unknown>;
    if (typeof taskId !== "string" || typeof agentId !== "string") {
      return NextResponse.json({ error: "taskId and agentId required" }, { status: 400 });
    }
    assignTask(taskId, agentId);
    return NextResponse.json({ action: "assign_task", taskId, agentId, success: true });
  }

  if (action === "complete_task") {
    const { taskId, status: taskStatus } = body as Record<string, unknown>;
    if (typeof taskId !== "string") {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    if (!["completed", "failed"].includes(taskStatus as string)) {
      return NextResponse.json({ error: "status must be 'completed' or 'failed'" }, { status: 400 });
    }
    completeTask(taskId, taskStatus as "completed" | "failed");
    return NextResponse.json({ action: "complete_task", taskId, success: true });
  }

  if (action === "distribute_task") {
    const { taskId } = body as Record<string, unknown>;
    if (typeof taskId !== "string") {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    const assignedAgent = distributeToLeastLoaded(taskId);
    return NextResponse.json({ action: "distribute_task", assignedAgent, assigned: assignedAgent !== null, success: true });
  }

  if (action === "initiate_consensus") {
    const { topic, participants, requiredMajority } = body as Record<string, unknown>;
    if (typeof topic !== "string") {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    if (!Array.isArray(participants)) {
      return NextResponse.json({ error: "participants array required" }, { status: 400 });
    }
    const consensus = initiateConsensus(
      topic,
      participants as string[],
      typeof requiredMajority === "number" ? requiredMajority : undefined,
      tenantId
    );
    return NextResponse.json({ action: "initiate_consensus", consensus, success: true }, { status: 201 });
  }

  if (action === "cast_vote") {
    const { id, agentId, vote } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof agentId !== "string") {
      return NextResponse.json({ error: "id and agentId required" }, { status: 400 });
    }
    if (!["approve", "reject", "abstain"].includes(vote as string)) {
      return NextResponse.json({ error: "vote must be 'approve', 'reject', or 'abstain'" }, { status: 400 });
    }
    castConsensusVote(id, agentId, vote as "approve" | "reject" | "abstain");
    return NextResponse.json({ action: "cast_vote", id, agentId, success: true });
  }

  if (action === "evaluate_consensus") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const consensus = evaluateConsensus(id);
    return NextResponse.json({ action: "evaluate_consensus", consensus, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_agent', 'update_load', 'create_task', 'assign_task', 'complete_task', 'distribute_task', 'initiate_consensus', 'cast_vote', or 'evaluate_consensus'.`,
    },
    { status: 400 }
  );
}
