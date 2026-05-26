import { validateArchitecture } from "@/lib/certification/architecture-validator";
import { validateTopology } from "@/lib/certification/topology-validator";
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer";
import { runComplianceValidation } from "@/lib/maturity/compliance-validator";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";

export interface EnterpriseCertificationReport {
  overallScore: number;
  certified: boolean;
  certificationLevel: "uncertified" | "standard" | "premium" | "enterprise";
  sections: {
    architecture: { compliant: boolean; score: number };
    topology: { valid: boolean; score: number };
    readiness: { score: number; level: string };
    compliance: { compliant: boolean; score: number };
    resilience: { score: number };
  };
  criticalIssues: string[];
  recommendations: string[];
  generatedAt: string;
}

export function generateEnterpriseCertification(): EnterpriseCertificationReport {
  const arch = validateArchitecture();
  const archTotal = arch.passed + arch.failed;
  const archScore = archTotal > 0 ? Math.round((arch.passed / archTotal) * 100) : 100;

  const topo = validateTopology();
  const topoTotal = topo.passed + topo.failed;
  const topoScore = topoTotal > 0 ? Math.round((topo.passed / topoTotal) * 100) : 100;

  const readiness = scoreOperationalReadiness();
  const compliance = runComplianceValidation();
  const resilience = getResilienceReport();
  const resTotal = Math.max(1, resilience.passed + resilience.failed);
  const resScore = Math.round((resilience.passed / resTotal) * 100);

  const overallScore = Math.round(
    archScore * 0.25 +
    topoScore * 0.2 +
    readiness.composite * 0.3 +
    compliance.score * 0.15 +
    resScore * 0.1
  );

  const certified = overallScore >= 85;

  let certificationLevel: EnterpriseCertificationReport["certificationLevel"];
  if (overallScore >= 95) {
    certificationLevel = "enterprise";
  } else if (overallScore >= 85) {
    certificationLevel = "premium";
  } else if (overallScore >= 70) {
    certificationLevel = "standard";
  } else {
    certificationLevel = "uncertified";
  }

  const criticalIssues: string[] = arch.criticalFailures.map(
    (c) => `[Architecture] ${c.name}: ${c.detail}`
  );

  const recommendations: string[] = [];
  if (archScore < 80) recommendations.push("Resolve architecture compliance failures to improve agent registry and governance coverage.");
  if (topoScore < 80) recommendations.push("Address topology gaps — ensure all adapters and agents are registered and active.");
  if (readiness.composite < 80) recommendations.push("Improve operational readiness by resolving open circuit breakers and governance issues.");
  if (compliance.score < 80) recommendations.push("Review compliance violations and enforce missing policy controls.");
  if (resScore < 80) recommendations.push("Run and fix failing resilience tests to strengthen fault-tolerance posture.");

  return {
    overallScore,
    certified,
    certificationLevel,
    sections: {
      architecture: { compliant: arch.compliant, score: archScore },
      topology: { valid: topo.topologyValid, score: topoScore },
      readiness: { score: Math.round(readiness.composite), level: readiness.certificationLevel },
      compliance: { compliant: compliance.overallCompliant, score: compliance.score },
      resilience: { score: resScore },
    },
    criticalIssues,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}
