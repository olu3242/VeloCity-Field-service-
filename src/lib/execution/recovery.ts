// Autonomous Recovery — graph-aware failure recovery for the Execution Fabric.
// When a node fails, recovery determines which branches can continue,
// which nodes should be retried or skipped, and whether to degrade or abort.

import { executeGraph } from "./graph";
import type {
  ExecutionContext,
  ExecutionGraph,
  ExecutionNode,
  RecoveryResult,
  RecoveryStrategy,
} from "./types";

export interface RecoveryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  allowPartialCompletion?: boolean;
  cachedFallbacks?: Map<string, unknown>;
  onStrategy?: (strategy: RecoveryStrategy, nodeId: string) => void;
}

// ── Dependency analysis ───────────────────────────────────────────────────────

function buildDownstreamSet(graph: ExecutionGraph, failedNodeId: string): Set<string> {
  const downstream = new Set<string>();
  const queue = [failedNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of graph.nodes) {
      if (node.dependencies.includes(current) && !downstream.has(node.id)) {
        downstream.add(node.id);
        queue.push(node.id);
      }
    }
  }

  return downstream;
}

function findUnaffectedNodes(graph: ExecutionGraph, failedNodeId: string): ExecutionNode[] {
  const downstream = buildDownstreamSet(graph, failedNodeId);
  return graph.nodes.filter(
    (n) =>
      n.id !== failedNodeId &&
      !downstream.has(n.id) &&
      n.status !== "completed",
  );
}

// ── Strategy selection ────────────────────────────────────────────────────────

function selectRecoveryStrategy(
  node: ExecutionNode,
  opts: RecoveryOptions,
): RecoveryStrategy {
  // If retries remain, try again
  if (node.retryCount < (opts.maxRetries ?? 2)) return "retry";

  // If a cached fallback is available, use it
  if (opts.cachedFallbacks?.has(node.id)) return "use-cache";

  // If the node is non-critical (no downstream dependents), skip it
  if (node.dependencies.length === 0) return "skip-node";

  // Default: degrade (continue unaffected branches, mark this subtree as degraded)
  return "degrade";
}

// ── Recovery executor ─────────────────────────────────────────────────────────

export async function recoverGraph(
  graph: ExecutionGraph,
  failedNodeId: string,
  executor: (node: ExecutionNode) => Promise<unknown>,
  opts: RecoveryOptions = {},
): Promise<RecoveryResult> {
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const failedNode = nodeMap.get(failedNodeId);

  if (!failedNode) {
    return {
      strategy: "abort",
      recoveredNodes: [],
      skippedNodes: [],
      continuedNodes: [],
      graph: { ...graph, nodes },
    };
  }

  const strategy = selectRecoveryStrategy(failedNode, opts);
  opts.onStrategy?.(strategy, failedNodeId);

  const recoveredNodes: string[] = [];
  const skippedNodes: string[] = [];
  const continuedNodes: string[] = [];

  if (strategy === "retry") {
    // Reset the failed node and re-execute just that branch
    failedNode.status = "pending";
    failedNode.error = undefined;
    // Re-run via the graph executor (it handles retry internally)
    const recovered = await executeGraph({ ...graph, nodes }, executor, {
      maxNodeRetries: (opts.maxRetries ?? 2) - failedNode.retryCount,
      onNodeComplete: (n) => recoveredNodes.push(n.id),
    });
    return {
      strategy,
      recoveredNodes,
      skippedNodes,
      continuedNodes,
      graph: recovered,
    };
  }

  if (strategy === "use-cache") {
    failedNode.output = opts.cachedFallbacks!.get(failedNodeId);
    failedNode.status = "completed";
    failedNode.metadata = { ...failedNode.metadata, fromCache: true };
    recoveredNodes.push(failedNodeId);
  } else if (strategy === "skip-node") {
    failedNode.status = "skipped";
    skippedNodes.push(failedNodeId);
  } else {
    // Degrade or abort: mark all downstream nodes as skipped, continue unaffected branches
    const downstream = buildDownstreamSet(graph, failedNodeId);
    for (const id of Array.from(downstream)) {
      const n = nodeMap.get(id);
      if (n && n.status === "pending") {
        n.status = "skipped";
        skippedNodes.push(id);
      }
    }
  }

  // Continue any branches that are unaffected by the failure
  if (opts.allowPartialCompletion !== false) {
    const unaffected = findUnaffectedNodes({ ...graph, nodes }, failedNodeId);
    for (const n of unaffected) {
      continuedNodes.push(n.id);
    }

    if (unaffected.length > 0) {
      const partial = await executeGraph(
        { ...graph, nodes },
        executor,
        { maxNodeRetries: opts.maxRetries ?? 2 },
      );
      return {
        strategy,
        recoveredNodes,
        skippedNodes,
        continuedNodes,
        graph: partial,
      };
    }
  }

  return {
    strategy,
    recoveredNodes,
    skippedNodes,
    continuedNodes,
    graph: { ...graph, nodes },
  };
}

// ── Context-level recovery ────────────────────────────────────────────────────
// Called by the engine when the top-level execution function throws.

export interface ContextRecoveryResult {
  recovered: boolean;
  strategy: RecoveryStrategy;
  degraded: boolean;
}

export async function recoverExecution(
  ctx: ExecutionContext,
  error: unknown,
): Promise<ContextRecoveryResult> {
  const errMsg = error instanceof Error ? error.message : String(error);

  // Network / dependency errors → retry
  if (
    errMsg.includes("network") ||
    errMsg.includes("timeout") ||
    errMsg.includes("ECONNREFUSED") ||
    errMsg.includes("unavailable")
  ) {
    if (ctx.telemetry.retryCount < 2) {
      return { recovered: true, strategy: "retry", degraded: false };
    }
    return { recovered: false, strategy: "degrade", degraded: true };
  }

  // Auth / permission errors → do not retry
  if (errMsg.includes("Unauthorized") || errMsg.includes("Forbidden")) {
    return { recovered: false, strategy: "abort", degraded: false };
  }

  // Business logic errors → degrade
  return { recovered: false, strategy: "degrade", degraded: true };
}
