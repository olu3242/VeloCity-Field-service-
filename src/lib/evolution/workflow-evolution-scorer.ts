export interface WorkflowEvolutionScore {
  workflowType: string;
  successRateDelta: number;
  latencyDelta: number;
  costDelta: number;
  evolutionScore: number;
  recommendation: string;
  scoredAt: string;
}

const SCORES = new Map<string, WorkflowEvolutionScore>();

export function scoreWorkflowEvolution(
  workflowType: string,
  current: { successRate: number; avgLatencyMs: number; costUsd: number },
  baseline: { successRate: number; avgLatencyMs: number; costUsd: number }
): WorkflowEvolutionScore {
  const successRateDelta = current.successRate - baseline.successRate;
  const latencyDelta = baseline.avgLatencyMs - current.avgLatencyMs;
  const costDelta = baseline.costUsd - current.costUsd;

  const rawScore =
    successRateDelta * 50 +
    (latencyDelta / Math.max(1, baseline.avgLatencyMs)) * 30 +
    (costDelta / Math.max(0.01, baseline.costUsd)) * 20;

  const evolutionScore = Math.min(100, Math.max(0, rawScore));

  const recommendation =
    evolutionScore >= 70
      ? "Promote to default path"
      : evolutionScore >= 40
      ? "Continue monitoring"
      : "Revert or investigate";

  const score: WorkflowEvolutionScore = {
    workflowType,
    successRateDelta,
    latencyDelta,
    costDelta,
    evolutionScore,
    recommendation,
    scoredAt: new Date().toISOString(),
  };
  SCORES.set(workflowType, score);
  return score;
}

export function getTopEvolvingWorkflows(limit = 10): WorkflowEvolutionScore[] {
  return Array.from(SCORES.values())
    .sort((a, b) => b.evolutionScore - a.evolutionScore)
    .slice(0, limit);
}

export function getEvolutionSummary(): {
  total: number;
  avgScore: number;
  topRecommendation: string;
} {
  const all = Array.from(SCORES.values());
  const total = all.length;
  const avgScore = total > 0 ? all.reduce((s, v) => s + v.evolutionScore, 0) / total : 0;
  const top = getTopEvolvingWorkflows(1)[0];
  const topRecommendation = top ? top.recommendation : "No workflows scored";
  return { total, avgScore, topRecommendation };
}
