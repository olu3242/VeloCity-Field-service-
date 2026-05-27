export interface PolicyEffectivenessRecord {
  policyId: string;
  name: string;
  evaluationsTotal: number;
  passRate: number;
  falsePositiveRate: number;
  avgEnforcementMs: number;
  effectivenessScore: number;
  lastUpdatedAt: string;
}

const EFFECTIVENESS: Map<string, PolicyEffectivenessRecord> = new Map();

export function recordPolicyResult(
  policyId: string,
  name: string,
  passed: boolean,
  wasFalsePositive: boolean,
  enforcementMs: number
): void {
  const existing = EFFECTIVENESS.get(policyId);
  if (!existing) {
    const effectivenessScore = (passed ? 1 : 0) * 60 + (wasFalsePositive ? 0 : 1) * 40;
    EFFECTIVENESS.set(policyId, {
      policyId,
      name,
      evaluationsTotal: 1,
      passRate: passed ? 1 : 0,
      falsePositiveRate: wasFalsePositive ? 1 : 0,
      avgEnforcementMs: enforcementMs,
      effectivenessScore,
      lastUpdatedAt: new Date().toISOString(),
    });
    return;
  }

  const n = existing.evaluationsTotal;
  const passRate = (existing.passRate * n + (passed ? 1 : 0)) / (n + 1);
  const falsePositiveRate =
    (existing.falsePositiveRate * n + (wasFalsePositive ? 1 : 0)) / (n + 1);
  const avgEnforcementMs = (existing.avgEnforcementMs * n + enforcementMs) / (n + 1);
  const effectivenessScore = passRate * 60 + (1 - falsePositiveRate) * 40;

  EFFECTIVENESS.set(policyId, {
    ...existing,
    name,
    evaluationsTotal: n + 1,
    passRate,
    falsePositiveRate,
    avgEnforcementMs,
    effectivenessScore,
    lastUpdatedAt: new Date().toISOString(),
  });
}

export function getPolicyEffectiveness(
  policyId: string
): PolicyEffectivenessRecord | undefined {
  return EFFECTIVENESS.get(policyId);
}

export function getWeakPolicies(threshold = 60): PolicyEffectivenessRecord[] {
  return Array.from(EFFECTIVENESS.values()).filter(
    (r) => r.effectivenessScore < threshold
  );
}

export function getEffectivenessSummary(): {
  totalPolicies: number;
  avgEffectiveness: number;
  weakPolicyCount: number;
} {
  const records = Array.from(EFFECTIVENESS.values());
  const totalPolicies = records.length;
  const avgEffectiveness =
    totalPolicies === 0
      ? 0
      : records.reduce((sum, r) => sum + r.effectivenessScore, 0) / totalPolicies;
  const weakPolicyCount = records.filter((r) => r.effectivenessScore < 60).length;
  return { totalPolicies, avgEffectiveness, weakPolicyCount };
}
