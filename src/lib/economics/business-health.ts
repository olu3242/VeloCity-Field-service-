// Business health intelligence scoring for tenants, providers, and the platform.

export interface TenantHealthScore {
  tenantId: string;
  automationHealth: number;
  disputeHealth: number;
  payoutHealth: number;
  providerNetworkHealth: number;
  aiEffectiveness: number;
  composite: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendations: string[];
}

export interface ProviderNetworkHealth {
  activeProviders: number;
  avgTrustScore: number;
  atRiskProviders: number;
  coverageGaps: string[];
  networkResilience: number;
}

export interface ExecutiveMetrics {
  operationalROI: number;
  automationEfficiency: number;
  aiValueScore: number;
  costPerResolvedDispute: number;
  platformHealthGrade: "A" | "B" | "C" | "D" | "F";
  topOpportunities: string[];
}

function toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function scoreTenantHealth(input: {
  tenantId: string;
  automationSuccessRate: number;
  disputeRate: number;
  payoutDelayDays: number;
  activeProviders: number;
  aiCallSuccessRate: number;
}): TenantHealthScore {
  const automationHealth = input.automationSuccessRate * 100;
  const disputeHealth = Math.max(0, 100 - input.disputeRate * 500);
  const payoutHealth = Math.max(0, 100 - input.payoutDelayDays * 10);
  const providerNetworkHealth = Math.min(100, input.activeProviders * 5);
  const aiEffectiveness = input.aiCallSuccessRate * 100;

  const composite =
    automationHealth * 0.3 +
    disputeHealth * 0.25 +
    payoutHealth * 0.2 +
    providerNetworkHealth * 0.15 +
    aiEffectiveness * 0.1;

  const dimensions: Array<{ label: string; score: number }> = [
    { label: "automation", score: automationHealth },
    { label: "dispute", score: disputeHealth },
    { label: "payout", score: payoutHealth },
    { label: "provider network", score: providerNetworkHealth },
    { label: "AI effectiveness", score: aiEffectiveness },
  ];
  dimensions.sort((a, b) => a.score - b.score);

  const recommendations: string[] = [];
  for (const dim of dimensions.slice(0, 2)) {
    if (dim.score < 60) {
      recommendations.push(`Improve ${dim.label} performance (score: ${dim.score.toFixed(0)})`);
    }
  }
  if (recommendations.length === 0) {
    recommendations.push("All dimensions performing well — maintain current practices");
  }

  return {
    tenantId: input.tenantId,
    automationHealth,
    disputeHealth,
    payoutHealth,
    providerNetworkHealth,
    aiEffectiveness,
    composite,
    grade: toGrade(composite),
    recommendations,
  };
}

export function scoreProviderNetworkHealth(input: {
  activeProviders: number;
  avgTrustScore: number;
  atRiskCount: number;
  coverageGaps?: string[];
}): ProviderNetworkHealth {
  const atRiskRatio =
    input.activeProviders > 0 ? input.atRiskCount / input.activeProviders : 0;
  const networkResilience = Math.max(
    0,
    Math.min(100, (1 - atRiskRatio) * (input.avgTrustScore / 100) * 100)
  );

  return {
    activeProviders: input.activeProviders,
    avgTrustScore: input.avgTrustScore,
    atRiskProviders: input.atRiskCount,
    coverageGaps: input.coverageGaps ?? [],
    networkResilience,
  };
}

export function buildExecutiveMetrics(input: {
  netROIUsd: number;
  automationRate: number;
  aiSuccessRate: number;
  avgDisputeCostUsd: number;
  disputesAutoResolved: number;
  disputesTotal: number;
}): ExecutiveMetrics {
  const aiValueScore = input.aiSuccessRate * 100;
  const automationEfficiency = input.automationRate * 100;

  const costPerResolvedDispute =
    input.disputesTotal > 0
      ? input.avgDisputeCostUsd *
        (1 - (input.disputesAutoResolved / input.disputesTotal) * 0.8)
      : 0;

  const healthRaw = (input.automationRate + input.aiSuccessRate) / 2 * 100;
  const platformHealthGrade = toGrade(healthRaw);

  const topOpportunities: string[] = [];
  if (input.automationRate < 0.7) {
    topOpportunities.push("Increase automation coverage to reduce manual overhead");
  }
  if (input.aiSuccessRate < 0.9) {
    topOpportunities.push("Review AI reliability — success rate below 90%");
  }
  if (input.netROIUsd < 0) {
    topOpportunities.push("Optimize AI execution costs — negative net ROI detected");
  }
  if (topOpportunities.length === 0) {
    topOpportunities.push("Platform operating at peak efficiency");
  }

  return {
    operationalROI: input.netROIUsd,
    automationEfficiency,
    aiValueScore,
    costPerResolvedDispute,
    platformHealthGrade,
    topOpportunities,
  };
}
