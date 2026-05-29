import "@/runtime/server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { emitEvent } from "@/lib/automation/emitEvent";
import { createCorrelationId } from "@/runtime/telemetry/correlation";
import { runOrchestration } from "@/runtime/orchestration/agent-orchestrator";
import { chooseExecutionStrategy } from "@/runtime/orchestration/strategy-engine";

export async function createMetaOrchestrationPlan(input: {
  tenantId?: string;
  objective: string;
  workflows: Array<{ workflowType: string; eventType?: string; capabilities?: string[]; payload?: Record<string, unknown>; priority?: number }>;
  priority?: number;
  correlationId?: string;
}) {
  const db = getAdminClient();
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const correlationId = input.correlationId ?? createCorrelationId("meta");
  const strategy = await chooseExecutionStrategy({
    priority: input.priority ?? 50,
    expectedTasks: input.workflows.length,
  });

  const graph = {
    nodes: input.workflows.map((workflow, index) => ({ id: `wf_${index}`, workflowType: workflow.workflowType })),
    edges: input.workflows.slice(1).map((_, index) => ({ from: `wf_${index}`, to: `wf_${index + 1}`, relation: "sequential_dependency" })),
  };

  const { data, error } = await db
    .from("meta_orchestration_plans")
    .insert({
      tenant_id: tenantId,
      objective: input.objective,
      priority: input.priority ?? 50,
      strategy: strategy.name,
      graph,
      plan: { workflows: input.workflows, strategy },
      correlation_id: correlationId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function executeMetaOrchestrationPlan(planId: string) {
  const db = getAdminClient();
  const { data: plan, error } = await db.from("meta_orchestration_plans").select("*").eq("id", planId).single();
  if (error) throw error;

  const workflows = ((plan.plan as { workflows?: Array<Record<string, unknown>> } | null)?.workflows ?? []);
  await db.from("meta_orchestration_plans").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", planId);

  const results = [];
  for (const workflow of workflows) {
    const result = await runOrchestration({
      tenantId: plan.tenant_id,
      workflowType: String(workflow.workflowType),
      eventType: typeof workflow.eventType === "string" ? workflow.eventType : undefined,
      capabilities: Array.isArray(workflow.capabilities) ? workflow.capabilities.filter((item): item is string => typeof item === "string") : undefined,
      payload: typeof workflow.payload === "object" && workflow.payload !== null ? workflow.payload as Record<string, unknown> : {},
      priority: Number(workflow.priority ?? plan.priority ?? 50),
      source: "meta_orchestrator",
      correlationId: plan.correlation_id,
    });

    await db.from("orchestration_checkpoints").insert({
      tenant_id: plan.tenant_id,
      plan_id: plan.id,
      run_id: result.runId,
      checkpoint_type: "workflow_completed",
      state: result,
      recovery_hint: { replay_workflow_type: workflow.workflowType },
      correlation_id: plan.correlation_id,
    });
    results.push(result);
  }

  const failed = results.filter((result) => result.status === "failed");
  const status = failed.length ? "failed" : "completed";
  await db.from("meta_orchestration_plans").update({ status, updated_at: new Date().toISOString() }).eq("id", planId);

  await emitEvent("meta_orchestration.completed", {
    tenant_id: plan.tenant_id,
    plan_id: plan.id,
    status,
    correlation_id: plan.correlation_id,
  }, `meta_orchestration.completed:${plan.id}`);

  return { planId, status, results };
}
