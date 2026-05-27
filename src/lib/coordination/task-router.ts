/**
 * VeloCity Task Router
 *
 * Routes tasks between agents using strategy-based decisions.
 * Maintains a rolling log of routing decisions (cap 500).
 */

import { AGENT_REGISTRY } from "@/lib/agents/registry";

// ── Types ─────────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "direct"
  | "load_balanced"
  | "priority_lane"
  | "broadcast"
  | "fallback_chain";

export interface TaskRoute {
  taskId: string;
  sourceAgent: string;
  targetAgent: string;
  strategy: RoutingStrategy;
  priority: number;
  tenantId?: string;
  estimatedDelayMs: number;
  rationale: string;
}

export interface RoutingDecision {
  route: TaskRoute;
  alternatives: TaskRoute[];
  decidedAt: string;
}

// ── Module state ──────────────────────────────────────────────────────────

export const ROUTING_LOG: RoutingDecision[] = [];
const LOG_CAP = 500;

// ── Helpers ───────────────────────────────────────────────────────────────

function pickStrategy(priority: number): RoutingStrategy {
  if (priority >= 80) return "priority_lane";
  if (priority >= 40) return "load_balanced";
  return "direct";
}

function delayForStrategy(strategy: RoutingStrategy): number {
  if (strategy === "priority_lane") return 0;
  if (strategy === "load_balanced") return 500;
  return 1000;
}

function buildRoute(
  taskId: string,
  sourceAgent: string,
  targetAgent: string,
  strategy: RoutingStrategy,
  priority: number,
  tenantId?: string,
): TaskRoute {
  return {
    taskId,
    sourceAgent,
    targetAgent,
    strategy,
    priority,
    tenantId,
    estimatedDelayMs: delayForStrategy(strategy),
    rationale: `Routed via ${strategy} to ${targetAgent} (priority=${priority})`,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export function routeTask(
  taskId: string,
  sourceAgent: string,
  taskType: string,
  priority: number,
  tenantId?: string,
): RoutingDecision {
  const allEntries = Object.values(AGENT_REGISTRY);

  const capable = allEntries.filter((reg) =>
    reg.supported_events.includes(taskType),
  );

  const primary = capable.length > 0 ? capable[0].name : "GABRIEL";
  const strategy = pickStrategy(priority);

  const route = buildRoute(taskId, sourceAgent, primary, strategy, priority, tenantId);

  const alternatives = capable
    .filter((reg) => reg.name !== primary)
    .slice(0, 2)
    .map((reg) =>
      buildRoute(taskId, sourceAgent, reg.name, strategy, priority, tenantId),
    );

  const decision: RoutingDecision = {
    route,
    alternatives,
    decidedAt: new Date().toISOString(),
  };

  ROUTING_LOG.push(decision);
  if (ROUTING_LOG.length > LOG_CAP) {
    ROUTING_LOG.splice(0, ROUTING_LOG.length - LOG_CAP);
  }

  return decision;
}

export function getRoutingHistory(
  sourceAgent?: string,
  limit = 20,
): RoutingDecision[] {
  const filtered = sourceAgent
    ? ROUTING_LOG.filter((d) => d.route.sourceAgent === sourceAgent)
    : ROUTING_LOG;
  return filtered.slice(-limit);
}

export function getRoutingStats(): {
  totalRouted: number;
  byStrategy: Record<RoutingStrategy, number>;
  avgPriority: number;
} {
  const byStrategy: Record<RoutingStrategy, number> = {
    direct: 0,
    load_balanced: 0,
    priority_lane: 0,
    broadcast: 0,
    fallback_chain: 0,
  };

  let prioritySum = 0;
  for (const d of ROUTING_LOG) {
    byStrategy[d.route.strategy] += 1;
    prioritySum += d.route.priority;
  }

  return {
    totalRouted: ROUTING_LOG.length,
    byStrategy,
    avgPriority: ROUTING_LOG.length > 0 ? prioritySum / ROUTING_LOG.length : 0,
  };
}
