import "@/runtime/server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";
import { runOrchestration } from "@/runtime/orchestration/agent-orchestrator";

export type ExecutionGraphNodeInput = {
  nodeKey: string;
  workflowType: string;
  dependencies?: string[];
  priority?: number;
  payload?: Record<string, unknown>;
  capabilities?: string[];
};

export async function createExecutionGraph(input: {
  tenantId: string;
  planId?: string;
  nodes: ExecutionGraphNodeInput[];
  correlationId?: string;
}) {
  const db = getAdminClient();
  const correlationId = input.correlationId ?? createCorrelationId("dag");
  const graph = {
    nodes: input.nodes.map((node) => ({ key: node.nodeKey, workflowType: node.workflowType, dependencies: node.dependencies ?? [] })),
  };

  const { data: created, error } = await db
    .from("execution_graphs")
    .insert({ tenant_id: input.tenantId, plan_id: input.planId ?? null, graph, correlation_id: correlationId })
    .select("*")
    .single();
  if (error) throw error;

  const rows = input.nodes.map((node) => ({
    tenant_id: input.tenantId,
    graph_id: created.id,
    node_key: node.nodeKey,
    workflow_type: node.workflowType,
    dependencies: node.dependencies ?? [],
    priority: node.priority ?? 50,
    payload: { ...(node.payload ?? {}), capabilities: node.capabilities ?? [] },
  }));
  const { error: nodeError } = await db.from("execution_graph_nodes").insert(rows);
  if (nodeError) throw nodeError;

  return created;
}

export async function executeGraph(graphId: string, concurrency = 3) {
  const db = getAdminClient();
  const { data: graph, error } = await db.from("execution_graphs").select("*").eq("id", graphId).single();
  if (error) throw error;

  await db.from("execution_graphs").update({ status: "running" }).eq("id", graphId);
  const { data } = await db.from("execution_graph_nodes").select("*").eq("graph_id", graphId).order("priority", { ascending: false });
  const nodes = (data ?? []) as Array<{
    id: string;
    tenant_id: string;
    node_key: string;
    workflow_type: string;
    dependencies: string[];
    priority: number;
    payload: Record<string, unknown>;
  }>;

  const completed = new Set<string>();
  const failed = new Set<string>();
  const results = [];

  while (completed.size + failed.size < nodes.length) {
    const ready = nodes
      .filter((node) => !completed.has(node.node_key) && !failed.has(node.node_key))
      .filter((node) => node.dependencies.every((dep) => completed.has(dep)))
      .slice(0, Math.max(1, concurrency));

    if (!ready.length) {
      const blocked = nodes.filter((node) => !completed.has(node.node_key) && !failed.has(node.node_key));
      await db.from("execution_graph_nodes").update({ status: "skipped" }).in("id", blocked.map((node) => node.id));
      blocked.forEach((node) => failed.add(node.node_key));
      break;
    }

    const batch = await Promise.all(ready.map(async (node) => {
      await db.from("execution_graph_nodes").update({ status: "running", started_at: new Date().toISOString() }).eq("id", node.id);
      const capabilities = Array.isArray(node.payload.capabilities)
        ? node.payload.capabilities.filter((item): item is string => typeof item === "string")
        : undefined;
      const result = await runOrchestration({
        tenantId: node.tenant_id,
        workflowType: node.workflow_type,
        capabilities,
        priority: node.priority,
        payload: node.payload,
        source: "execution_graph",
        correlationId: graph.correlation_id,
      });
      await db.from("execution_graph_nodes").update({
        status: result.status === "completed" ? "completed" : "failed",
        output: result,
        run_id: result.runId,
        completed_at: new Date().toISOString(),
      }).eq("id", node.id);
      return { node, result };
    }));

    for (const item of batch) {
      results.push(item);
      if (item.result.status === "completed") completed.add(item.node.node_key);
      else failed.add(item.node.node_key);
    }
  }

  const status = failed.size ? "failed" : "completed";
  await db.from("execution_graphs").update({ status, completed_at: new Date().toISOString() }).eq("id", graphId);
  await db.from("cognition_telemetry").insert({
    tenant_id: graph.tenant_id,
    signal_type: "graph_execution",
    subject_type: "execution_graph",
    subject_id: graphId,
    score: nodes.length ? completed.size / nodes.length : 0,
    confidence: 0.82,
    metadata: { completed: completed.size, failed: failed.size, concurrency },
    correlation_id: graph.correlation_id,
  }).then(() => null);

  return { graphId, status, completed: completed.size, failed: failed.size, results };
}
