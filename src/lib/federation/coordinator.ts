import type { AgentName, AgentContext } from "@/lib/contracts/agents";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export type DelegationTaskType = "escalate" | "handoff" | "consult" | "notify" | "coordinate";
export type DelegationStatus = "queued" | "executing" | "completed" | "failed";

export interface DelegationRequest {
  fromAgent: AgentName;
  toAgent: AgentName;
  taskType: DelegationTaskType;
  payload: Record<string, unknown>;
  context: AgentContext;
  priority: "low" | "medium" | "high" | "critical";
  traceId: string;
}

export interface DelegationResult {
  delegationId: string;
  fromAgent: AgentName;
  toAgent: AgentName;
  taskType: DelegationTaskType;
  status: DelegationStatus;
  result?: Record<string, unknown>;
  error?: string;
  traceId: string;
  createdAt: string;
  completedAt?: string;
}

const activeDelegations = new Map<string, DelegationResult>();

export async function delegateTask(request: DelegationRequest): Promise<DelegationResult> {
  const delegationId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();

  const fromReg = AGENT_REGISTRY[request.fromAgent];
  const toReg = AGENT_REGISTRY[request.toAgent];

  if (!fromReg || fromReg.status !== "active" || !toReg || toReg.status !== "active") {
    const result: DelegationResult = {
      delegationId,
      fromAgent: request.fromAgent,
      toAgent: request.toAgent,
      taskType: request.taskType,
      status: "failed",
      error: `One or both agents are not active in the registry (from: ${request.fromAgent}, to: ${request.toAgent})`,
      traceId: request.traceId,
      createdAt,
    };
    activeDelegations.set(delegationId, result);
    return result;
  }

  const queued: DelegationResult = {
    delegationId,
    fromAgent: request.fromAgent,
    toAgent: request.toAgent,
    taskType: request.taskType,
    status: "queued",
    traceId: request.traceId,
    createdAt,
  };
  activeDelegations.set(delegationId, queued);

  try {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent("agent_run", {
      from_agent: request.fromAgent,
      to_agent: request.toAgent,
      task_type: request.taskType,
      delegation_id: delegationId,
      ...request.payload,
      ...(request.context.tenantId ? { tenant_id: request.context.tenantId } : {}),
    });
  } catch {
    // emitEvent failure is non-fatal — delegation still recorded
  }

  const completed: DelegationResult = {
    ...queued,
    status: "completed",
    completedAt: new Date().toISOString(),
  };
  activeDelegations.set(delegationId, completed);
  return completed;
}

export function getDelegation(id: string): DelegationResult | null {
  return activeDelegations.get(id) ?? null;
}

export function getActiveDelegations(): DelegationResult[] {
  return Array.from(activeDelegations.values());
}
