import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { runDeploymentHealthCheck } from "@/lib/maturity/deployment-health";
import { runComplianceValidation } from "@/lib/maturity/compliance-validator";

export interface ReadinessScore {
  dimension: string;
  score: number;
  weight: number;
  notes: string;
}

export interface OperationalReadiness {
  composite: number;
  certified: boolean;
  dimensions: ReadinessScore[];
  certificationLevel: "uncertified" | "standard" | "premium" | "enterprise";
  generatedAt: string;
}

export function scoreOperationalReadiness(): OperationalReadiness {
  const dimensions: ReadinessScore[] = [];

  // 1. Governance (weight 0.25)
  const openCount = getAllCircuits().filter((c) => c.state === "open").length;
  const governanceScore = Math.max(0, 100 - openCount * 20);
  dimensions.push({
    dimension: "Governance",
    score: governanceScore,
    weight: 0.25,
    notes: `${openCount} open circuit(s)`,
  });

  // 2. Observability (weight 0.20)
  const effectiveness = calculateEffectiveness();
  dimensions.push({
    dimension: "Observability",
    score: effectiveness.composite,
    weight: 0.20,
    notes: `Composite effectiveness: ${Math.round(effectiveness.composite)}`,
  });

  // 3. Resilience (weight 0.20)
  const report = getResilienceReport();
  const total = report.passed + report.failed;
  const resilienceScore = total > 0 ? (report.passed / total) * 100 : 100;
  dimensions.push({
    dimension: "Resilience",
    score: resilienceScore,
    weight: 0.20,
    notes: `${report.passed} of ${total} resilience tests passing`,
  });

  // 4. Integration Health (weight 0.15)
  const healthReport = runDeploymentHealthCheck();
  dimensions.push({
    dimension: "Integration Health",
    score: healthReport.score,
    weight: 0.15,
    notes: `Deployment health status: ${healthReport.overallStatus}`,
  });

  // 5. Compliance (weight 0.20)
  const complianceReport = runComplianceValidation();
  dimensions.push({
    dimension: "Compliance",
    score: complianceReport.score,
    weight: 0.20,
    notes: `Compliance score: ${complianceReport.score}, overall compliant: ${complianceReport.overallCompliant}`,
  });

  const composite = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  const certificationLevel: OperationalReadiness["certificationLevel"] =
    composite >= 95
      ? "enterprise"
      : composite >= 85
      ? "premium"
      : composite >= 70
      ? "standard"
      : "uncertified";

  const certified = composite >= 85;

  return {
    composite,
    certified,
    dimensions,
    certificationLevel,
    generatedAt: new Date().toISOString(),
  };
}
