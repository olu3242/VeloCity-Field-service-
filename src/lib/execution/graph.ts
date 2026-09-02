// Execution Graph Engine — converts a workflow into a DAG and executes it.
// Supports parallel branches, node retry, failure isolation, and partial completion.
// Wave-by-wave execution: each wave runs all currently-ready nodes concurrently,
// waits for the wave to settle, then identifies newly-unblocked nodes.

import { generateRequestId } from "@/lib/tracing/span";
import type { ExecutionGraph, ExecutionNode, ExecutionEdge, NodeStatus } from "./types";

export type NodeExecutor = (node: ExecutionNode) => Promise<unknown>;

export interface GraphExecutionOptions {
  maxNodeRetries?: number;
  nodeTimeoutMs?: number;
  onNodeStart?: (node: ExecutionNode) => void;
  onNodeComplete?: (node: ExecutionNode) => void;
  onNodeFail?: (node: ExecutionNode, attempt: number) => void;
}

// ── Graph builder ─────────────────────────────────────────────────────────────

export function buildGraph(
  steps: Array<{ id: string; name: string; workstream: string; dependsOn?: string[] }>,
): ExecutionGraph {
  const nodes: ExecutionNode[] = steps.map((s) => ({
    id: s.id,
    name: s.name,
    workstream: s.workstream,
    dependencies: s.dependsOn ?? [],
    status: "pending",
    retryCount: 0,
    maxRetries: 2,
    metadata: {},
  }));

  const edges: ExecutionEdge[] = steps.flatMap((s) =>
    (s.dependsOn ?? []).map((dep) => ({ from: dep, to: s.id })),
  );

  return {
    id: generateRequestId(),
    nodes,
    edges,
    criticalPath: computeCriticalPath(nodes, edges),
    generatedAt: new Date().toISOString(),
  };
}

// ── Critical path (longest chain by node count) ───────────────────────────────

function computeCriticalPath(nodes: ExecutionNode[], edges: ExecutionEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const memo = new Map<string, string[]>();

  function longestFrom(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;
    const children = adj.get(id) ?? [];
    if (children.length === 0) {
      memo.set(id, [id]);
      return [id];
    }
    const best = children
      .map((c) => longestFrom(c))
      .reduce((a, b) => (a.length >= b.length ? a : b));
    const result = [id, ...best];
    memo.set(id, result);
    return result;
  }

  const roots = nodes
    .filter((n) => n.dependencies.length === 0)
    .map((n) => n.id);

  if (roots.length === 0) return nodes.map((n) => n.id);

  return roots
    .map((r) => longestFrom(r))
    .reduce((a, b) => (a.length >= b.length ? a : b));
}

// ── Topological validation ────────────────────────────────────────────────────

export function validateDAG(graph: ExecutionGraph): { valid: boolean; error?: string } {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const node of graph.nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        return { valid: false, error: `Node "${node.id}" depends on unknown node "${dep}"` };
      }
    }
  }

  // Cycle detection via DFS coloring
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      if (color.get(next) === GRAY) return false;
      if (color.get(next) === WHITE && !dfs(next)) return false;
    }
    color.set(id, BLACK);
    return true;
  }

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE && !dfs(node.id)) {
      return { valid: false, error: "Execution graph contains a cycle" };
    }
  }

  return { valid: true };
}

// ── DAG Executor ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runNode(
  node: ExecutionNode,
  executor: NodeExecutor,
  opts: GraphExecutionOptions,
): Promise<void> {
  node.status = "running";
  node.startedAt = new Date().toISOString();
  opts.onNodeStart?.(node);

  const t0 = Date.now();
  const maxRetries = node.maxRetries ?? opts.maxNodeRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (opts.nodeTimeoutMs) {
        node.output = await Promise.race([
          executor(node),
          sleep(opts.nodeTimeoutMs).then(() => {
            throw new Error(`Node "${node.id}" timed out after ${opts.nodeTimeoutMs}ms`);
          }),
        ]);
      } else {
        node.output = await executor(node);
      }

      node.status = "completed";
      node.completedAt = new Date().toISOString();
      node.durationMs = Date.now() - t0;
      opts.onNodeComplete?.(node);
      return;
    } catch (err) {
      node.retryCount++;
      node.error = err instanceof Error ? err.message : String(err);
      opts.onNodeFail?.(node, attempt + 1);

      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 100);
      }
    }
  }

  node.status = "failed";
  node.completedAt = new Date().toISOString();
  node.durationMs = Date.now() - t0;
}

export async function executeGraph(
  graph: ExecutionGraph,
  executor: NodeExecutor,
  opts: GraphExecutionOptions = {},
): Promise<ExecutionGraph> {
  const nodes = graph.nodes.map((n) => ({ ...n, status: "pending" as NodeStatus }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const completed = new Set<string>();
  const failed = new Set<string>();

  function isDone(id: string) {
    return completed.has(id) || failed.has(id);
  }

  function allDependenciesMet(node: ExecutionNode) {
    return node.dependencies.every((dep) => completed.has(dep));
  }

  function anyDependencyFailed(node: ExecutionNode) {
    return node.dependencies.some((dep) => failed.has(dep));
  }

  function getReadyNodes() {
    return nodes.filter(
      (n) => n.status === "pending" && allDependenciesMet(n),
    );
  }

  // Wave-by-wave: each wave runs all currently unblocked nodes in parallel
  let progress = true;
  while (progress) {
    progress = false;

    // Skip nodes whose dependencies permanently failed
    for (const node of nodes) {
      if (node.status === "pending" && anyDependencyFailed(node)) {
        node.status = "skipped";
        progress = true;
      }
    }

    const wave = getReadyNodes();
    if (wave.length === 0) break;

    progress = true;
    await Promise.allSettled(
      wave.map(async (node) => {
        await runNode(node, executor, opts);
        if (node.status === "completed") completed.add(node.id);
        else failed.add(node.id);
      }),
    );
  }

  // Any still-pending nodes are unreachable (shouldn't happen in a valid DAG)
  for (const node of nodes) {
    if (!isDone(node.id) && node.status === "pending") {
      node.status = "skipped";
    }
  }

  const completedCount = nodes.filter((n) => n.status === "completed").length;
  const criticalPath = computeCriticalPath(nodes, graph.edges);

  return {
    ...graph,
    nodes,
    criticalPath,
    generatedAt: graph.generatedAt,
  };
}

// ── Single-node graph (for simple workstream executions) ──────────────────────

export function singleNodeGraph(workstream: string, workflow: string): ExecutionGraph {
  return buildGraph([{ id: `${workstream}.${workflow}`, name: workflow, workstream }]);
}

// ── Graph statistics ──────────────────────────────────────────────────────────

export interface GraphStats {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  successRate: number;
  maxParallelism: number;
}

export function computeGraphStats(graph: ExecutionGraph): GraphStats {
  const total = graph.nodes.length;
  const completed = graph.nodes.filter((n) => n.status === "completed").length;
  const failed = graph.nodes.filter((n) => n.status === "failed").length;
  const skipped = graph.nodes.filter((n) => n.status === "skipped").length;

  // Max parallelism: largest number of nodes that started in the same "wave"
  // Approximate by counting nodes with overlapping time ranges
  const running = graph.nodes.filter((n) => n.startedAt && n.completedAt);
  let maxParallelism = 1;
  for (let i = 0; i < running.length; i++) {
    let count = 1;
    const a = running[i];
    for (let j = i + 1; j < running.length; j++) {
      const b = running[j];
      if (
        new Date(b.startedAt!).getTime() < new Date(a.completedAt!).getTime() &&
        new Date(a.startedAt!).getTime() < new Date(b.completedAt!).getTime()
      ) count++;
    }
    if (count > maxParallelism) maxParallelism = count;
  }

  return {
    total,
    completed,
    failed,
    skipped,
    successRate: total > 0 ? completed / total : 1,
    maxParallelism,
  };
}
