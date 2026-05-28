import { getAgentsByEvent, getAgent } from "@/lib/agents/registry";
import { runAgent } from "@/lib/agents/runAgent";
import { routeTask } from "@/lib/coordination/task-router";
import { emitEvent } from "@/lib/automation/emitEvent";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { getAdminClient } from "@/lib/supabase/admin";
import { recordAiGovernanceDecision } from "@/runtime/ai/governance";
import { createCorrelationId } from "@/runtime/telemetry/correlation";
import { recallContextMemory, storeContextMemory } from "@/runtime/memory/context-fabric";
import { scoreOrchestrationCognition } from "@/runtime/intelligence/cognition-scoring";
import type { AgentName, AgentResponse } from "@/types";

const CAPABILITY_AGENT: Record<string, AgentName> = {
  dispatch: "MAX",
  crm: "LENA",
  growth: "LENA",
  territory: "TESS",
  monetization: "FINN",
  fraud: "GABRIEL",
  remediation: "GABRIEL",
  notifications: "NOVA",
};

function chooseAgents(input: { eventType?: string; capabilities?: string[] }): AgentName[] {
  const byCapability = (input.capabilities ?? [])
    .map((capability) => CAPABILITY_AGENT[capability])
    .filter((agent): agent is AgentName => Boolean(agent));
  const byEvent = input.eventType ? getAgentsByEvent(input.eventType).map((agent) => agent.name as unknown as AgentName) : [];
  return Array.from(new Set<AgentName>([...byCapability, ...byEvent, "GABRIEL"])).slice(0, 5);
}

export async function runOrchestration(input: {
  tenantId?: string;
  workflowType: string;
  eventType?: string;
  capabilities?: string[];
  payload: Record<string, unknown>;
  priority?: number;
  source?: string;
  actorId?: string;
  correlationId?: string;
}) {
  const db = getAdminClient();
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const correlationId = input.correlationId ?? createCorrelationId("orch");
  const priority = input.priority ?? 50;
  const agents = chooseAgents(input);

  const { data: run, error: runError } = await db
    .from("orchestration_runs")
    .insert({
      tenant_id: tenantId,
      workflow_type: input.workflowType,
      status: "running",
      priority,
      source: input.source ?? "api",
      correlation_id: correlationId,
      input: input.payload,
    })
    .select("*")
    .single();
  if (runError) throw runError;

  const memories = await recallContextMemory({ tenantId, limit: 10 }).catch(() => []);
  const outputs = [];

  for (const agentName of agents) {
    const agent = getAgent(agentName as never);
    const decision = routeTask(run.id, "ORCHESTRATOR", input.eventType ?? input.workflowType, priority, tenantId);
    const { data: task, error: taskError } = await db
      .from("orchestration_tasks")
      .insert({
        tenant_id: tenantId,
        run_id: run.id,
        agent_name: agentName,
        capability: agent.capability_type,
        status: "running",
        priority,
        attempt_count: 1,
        max_attempts: agent.execution_limits.max_retries + 1,
        input: { payload: input.payload, route: decision, memory_count: memories.length },
        correlation_id: correlationId,
      })
      .select("*")
      .single();
    if (taskError) throw taskError;

    const started = Date.now();
    const result: AgentResponse<Record<string, unknown>> = await runAgent(agentName, {
      ...input.payload,
      tenant_id: tenantId,
      correlation_id: correlationId,
      orchestration_run_id: run.id,
      memory: memories.slice(0, 5),
    }).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
      data: {},
    }));

    const latencyMs = result.latencyMs ?? Date.now() - started;
    const confidence = result.success ? 0.86 : 0.35;
    await recordAiGovernanceDecision({
      tenantId,
      actorId: input.actorId,
      agent: agentName,
      domain: agent.capability_type,
      action: input.workflowType,
      confidence,
      promptTokens: result.tokensUsed ?? 0,
      completionTokens: 0,
      latencyMs,
      fallbackUsed: !result.success,
      correlationId,
      metadata: { run_id: run.id, task_id: task.id, event_type: input.eventType },
    }).catch(() => null);

    await db.from("orchestration_tasks").update({
      status: result.success ? "completed" : "failed",
      output: result.success ? result.data ?? {} : {},
      error_message: result.error ?? null,
      latency_ms: latencyMs,
      confidence,
      completed_at: new Date().toISOString(),
    }).eq("id", task.id);

    outputs.push({ agent: agentName, success: result.success, data: result.data, error: result.error, latencyMs, confidence });

    if (result.success) {
      await storeContextMemory({
        tenantId,
        scope: "workflow",
        workflowId: run.id,
        contextKey: `${agentName}:${input.workflowType}`,
        value: { agent: agentName, output: result.data ?? {}, event_type: input.eventType },
        confidence,
        correlationId,
        ttlMs: 24 * 60 * 60_000,
      }).catch(() => null);
    }
  }

  const failed = outputs.filter((output) => !output.success);
  const status = failed.length === 0 ? "completed" : failed.length === outputs.length ? "failed" : "partial";
  const avgLatencyMs = outputs.length ? Math.round(outputs.reduce((sum, output) => sum + output.latencyMs, 0) / outputs.length) : 0;
  const avgConfidence = outputs.length ? outputs.reduce((sum, output) => sum + output.confidence, 0) / outputs.length : 0;
  await db.from("orchestration_runs").update({
    status,
    output: { agents: outputs },
    error_message: failed.length ? `${failed.length} agent task(s) failed` : null,
    completed_at: new Date().toISOString(),
  }).eq("id", run.id);

  await scoreOrchestrationCognition({
    tenantId,
    subjectType: "orchestration_run",
    subjectId: run.id,
    scoreType: "execution_quality",
    latencyMs: avgLatencyMs,
    failureCount: failed.length,
    confidence: avgConfidence,
    correlationId,
  }).catch(() => null);

  await emitEvent("orchestration.completed", {
    tenant_id: tenantId,
    orchestration_run_id: run.id,
    workflow_type: input.workflowType,
    status,
    correlation_id: correlationId,
  }, `orchestration.completed:${run.id}`);

  return { runId: run.id, status, agents: outputs, correlationId };
}
