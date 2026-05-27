export interface StrategicRisk {
  id: string;
  riskType: "capacity" | "compliance" | "churn" | "cost_overrun" | "infrastructure";
  probability: number;
  impactScore: number;
  riskScore: number;
  horizon: "short" | "medium" | "long";
  mitigationSuggestion: string;
  generatedAt: string;
}

const RISKS: StrategicRisk[] = [];
const CAP = 100;

export function assessRisk(
  riskType: StrategicRisk["riskType"],
  probability: number,
  impactScore: number,
  horizon: StrategicRisk["horizon"],
  mitigationSuggestion: string
): StrategicRisk {
  const riskScore = Math.min(100, probability * impactScore);
  const risk: StrategicRisk = {
    id: crypto.randomUUID(),
    riskType,
    probability,
    impactScore,
    riskScore,
    horizon,
    mitigationSuggestion,
    generatedAt: new Date().toISOString(),
  };
  RISKS.push(risk);
  if (RISKS.length > CAP) {
    RISKS.splice(0, RISKS.length - CAP);
  }
  return risk;
}

export function getHighPriorityRisks(threshold = 50): StrategicRisk[] {
  return RISKS.filter((r) => r.riskScore >= threshold);
}

export function getRiskSummary(): {
  total: number;
  avgRiskScore: number;
  byType: Record<string, number>;
  topRisk: StrategicRisk | undefined;
} {
  const total = RISKS.length;
  const avgRiskScore =
    total === 0 ? 0 : RISKS.reduce((sum, r) => sum + r.riskScore, 0) / total;

  const byType: Record<string, number> = {};
  for (const risk of RISKS) {
    byType[risk.riskType] = (byType[risk.riskType] ?? 0) + 1;
  }

  const topRisk =
    total === 0
      ? undefined
      : RISKS.reduce((max, r) => (r.riskScore > max.riskScore ? r : max), RISKS[0]);

  return { total, avgRiskScore, byType, topRisk };
}
