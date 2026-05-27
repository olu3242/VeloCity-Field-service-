import { getOperatorState } from "@/lib/governance/operator";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer";

export interface MaturityDimension {
  name: string;
  score: number;
  weight: number;
}

export interface MaturityReport {
  overallScore: number;
  level: "initial" | "developing" | "defined" | "optimized";
  dimensions: MaturityDimension[];
  generatedAt: string;
}

export function analyzeMaturity(): MaturityReport {
  const opState = getOperatorState();
  const governanceScore = opState ? 100 : 50;

  const report = getResilienceReport();
  const resilienceScore =
    (report.passed / Math.max(1, report.passed + report.failed)) * 100;

  const effectivenessScore = calculateEffectiveness().composite;

  const readinessScore = scoreOperationalReadiness().composite;

  const dimensions: MaturityDimension[] = [
    { name: "governance", score: governanceScore, weight: 0.3 },
    { name: "resilience", score: resilienceScore, weight: 0.3 },
    { name: "effectiveness", score: effectivenessScore, weight: 0.2 },
    { name: "readiness", score: readinessScore, weight: 0.2 },
  ];

  const overallScore = dimensions.reduce((s, d) => s + d.score * d.weight, 0);

  const level: MaturityReport["level"] =
    overallScore >= 85
      ? "optimized"
      : overallScore >= 70
      ? "defined"
      : overallScore >= 50
      ? "developing"
      : "initial";

  return {
    overallScore,
    level,
    dimensions,
    generatedAt: new Date().toISOString(),
  };
}
