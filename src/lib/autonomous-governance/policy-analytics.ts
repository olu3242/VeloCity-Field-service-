/**
 * Policy Analytics — tracks policy evaluation metrics in-memory.
 * Uses rolling average for response time.
 */

export interface PolicyMetric {
  policyId: string;
  evaluationCount: number;
  passRate: number;
  avgResponseMs: number;
  lastEvaluatedAt: string;
}

export const POLICY_METRICS: Map<string, PolicyMetric> = new Map();

export function recordPolicyEvaluation(
  policyId: string,
  passed: boolean,
  responseMs: number
): void {
  const existing = POLICY_METRICS.get(policyId);
  if (!existing) {
    POLICY_METRICS.set(policyId, {
      policyId,
      evaluationCount: 1,
      passRate: passed ? 1 : 0,
      avgResponseMs: responseMs,
      lastEvaluatedAt: new Date().toISOString(),
    });
    return;
  }
  const newCount = existing.evaluationCount + 1;
  const totalPassed = Math.round(existing.passRate * existing.evaluationCount) + (passed ? 1 : 0);
  const newPassRate = totalPassed / newCount;
  const newAvgMs =
    (existing.avgResponseMs * existing.evaluationCount + responseMs) / newCount;
  existing.evaluationCount = newCount;
  existing.passRate = newPassRate;
  existing.avgResponseMs = newAvgMs;
  existing.lastEvaluatedAt = new Date().toISOString();
}

export function getPolicyMetrics(
  policyId: string
): PolicyMetric | undefined {
  return POLICY_METRICS.get(policyId);
}

export function getUnderperformingPolicies(
  passRateThreshold = 0.8
): PolicyMetric[] {
  return Array.from(POLICY_METRICS.values()).filter(
    (m) => m.passRate < passRateThreshold
  );
}

export function getPolicyAnalyticsSummary(): {
  totalEvaluations: number;
  avgPassRate: number;
  mostEvaluated: PolicyMetric | undefined;
} {
  const all = Array.from(POLICY_METRICS.values());
  if (all.length === 0) {
    return { totalEvaluations: 0, avgPassRate: 0, mostEvaluated: undefined };
  }
  const totalEvaluations = all.reduce((s, m) => s + m.evaluationCount, 0);
  const avgPassRate =
    all.reduce((s, m) => s + m.passRate, 0) / all.length;
  const mostEvaluated = all.reduce((a, b) =>
    a.evaluationCount >= b.evaluationCount ? a : b
  );
  return { totalEvaluations, avgPassRate, mostEvaluated };
}
