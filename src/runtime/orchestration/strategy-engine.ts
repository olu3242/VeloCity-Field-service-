import "@/runtime/server-only";
import { getSystemHealth } from "@/runtime/health/system-health";

export type ExecutionStrategy = {
  name: "latency_first" | "cost_aware" | "resilient" | "balanced";
  maxConcurrency: number;
  timeoutMs: number;
  retryBudget: number;
  rationale: string[];
};

export async function chooseExecutionStrategy(input: {
  priority: number;
  expectedTasks: number;
  riskScore?: number;
}): Promise<ExecutionStrategy> {
  const health = await getSystemHealth().catch(() => null);
  const rationale: string[] = [];

  if (input.priority >= 85) {
    rationale.push("High priority workflow favors latency.");
    return { name: "latency_first", maxConcurrency: Math.min(input.expectedTasks, 6), timeoutMs: 20_000, retryBudget: 1, rationale };
  }

  if ((input.riskScore ?? 0) >= 0.7 || health?.status === "degraded") {
    rationale.push("Elevated risk or degraded runtime favors resilient execution.");
    return { name: "resilient", maxConcurrency: 2, timeoutMs: 45_000, retryBudget: 3, rationale };
  }

  if (health?.queue.pending && health.queue.pending > 50) {
    rationale.push("Queue pressure favors cost-aware throttling.");
    return { name: "cost_aware", maxConcurrency: 1, timeoutMs: 30_000, retryBudget: 1, rationale };
  }

  rationale.push("Runtime normal; balanced strategy selected.");
  return { name: "balanced", maxConcurrency: Math.min(input.expectedTasks, 3), timeoutMs: 30_000, retryBudget: 2, rationale };
}
