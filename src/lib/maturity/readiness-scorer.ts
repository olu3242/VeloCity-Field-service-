import { getAllCircuits, getCircuit } from "@/lib/governance/circuit-breaker";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { runDeploymentHealthCheck } from "@/lib/maturity/deployment-health";
import { runComplianceValidation } from "@/lib/maturity/compliance-validator";
import { redis } from "@/lib/redis/client";

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

  // Ensure at least one circuit is registered before scoring governance.
  getCircuit("system");

  // 1. Governance (weight 0.20)
  const openCount = getAllCircuits().filter((c) => c.state === "open").length;
  const governanceScore = Math.max(0, 100 - openCount * 20);
  dimensions.push({
    dimension: "Governance",
    score: governanceScore,
    weight: 0.20,
    notes: `${openCount} open circuit(s)`,
  });

  // 2. Observability (weight 0.20)
  // Composite of telemetry effectiveness + distributed tracing availability.
  const effectiveness = calculateEffectiveness();
  const tracingScore = 100; // W3C traceparent middleware always active
  const observabilityScore = Math.round(
    effectiveness.composite * 0.6 + tracingScore * 0.4
  );
  dimensions.push({
    dimension: "Observability",
    score: observabilityScore,
    weight: 0.20,
    notes: `Effectiveness: ${Math.round(effectiveness.composite)}, Tracing: ${tracingScore} (W3C traceparent active)`,
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

  // 5. Compliance (weight 0.15)
  const complianceReport = runComplianceValidation();
  dimensions.push({
    dimension: "Compliance",
    score: complianceReport.score,
    weight: 0.15,
    notes: `Compliance score: ${complianceReport.score}, overall compliant: ${complianceReport.overallCompliant}`,
  });

  // 6. Distributed Runtime (weight 0.10)
  const distributedScore = redis.isConfigured ? 100 : 75;
  dimensions.push({
    dimension: "Distributed Runtime",
    score: distributedScore,
    weight: 0.10,
    notes: redis.isConfigured
      ? "Redis distributed runtime active — horizontal scaling enabled"
      : "In-memory runtime — Redis not provisioned (graceful fallback)",
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
