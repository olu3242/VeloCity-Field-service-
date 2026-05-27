import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { getOperatorState } from "@/lib/governance/operator";

export interface StrategicMaturityReport {
  overallScore: number;
  tier: "foundational" | "operational" | "advanced" | "elite";
  dimensions: { name: string; score: number }[];
  generatedAt: string;
}

const MATURITY_HISTORY: StrategicMaturityReport[] = [];
const CAP = 50;

function computeTier(
  score: number
): StrategicMaturityReport["tier"] {
  if (score >= 90) return "elite";
  if (score >= 75) return "advanced";
  if (score >= 55) return "operational";
  return "foundational";
}

export function scoreStrategicMaturity(): StrategicMaturityReport {
  const aiEffectiveness = calculateEffectiveness().composite;
  const operationalReadiness = scoreOperationalReadiness().composite;

  const resilienceReport = getResilienceReport();
  const total = resilienceReport.passed + resilienceReport.failed;
  const resilience = (resilienceReport.passed / Math.max(1, total)) * 100;

  const governance = getOperatorState() !== undefined ? 100 : 0;

  const dimensions = [
    { name: "ai_effectiveness", score: aiEffectiveness },
    { name: "operational_readiness", score: operationalReadiness },
    { name: "resilience", score: resilience },
    { name: "governance", score: governance },
  ];

  const overallScore =
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;

  return {
    overallScore,
    tier: computeTier(overallScore),
    dimensions,
    generatedAt: new Date().toISOString(),
  };
}

export function recordMaturitySnapshot(): StrategicMaturityReport {
  const report = scoreStrategicMaturity();
  MATURITY_HISTORY.push(report);
  if (MATURITY_HISTORY.length > CAP) {
    MATURITY_HISTORY.splice(0, MATURITY_HISTORY.length - CAP);
  }
  return report;
}

export { MATURITY_HISTORY };
