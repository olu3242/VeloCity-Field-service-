import { buildScore, type CommandCenterMetrics, type CommandCenterScore } from "./types";

export function calculateMarketplaceHealthScore(metrics: CommandCenterMetrics): CommandCenterScore {
  const providerCoverage = metrics.totalProviders ? (metrics.activeProviders / metrics.totalProviders) * 35 : 0;
  const supplyPenalty = metrics.providerSupplyGaps * 10 + metrics.unassignedJobs * 6;
  const completionBoost = Math.min(20, metrics.completedJobs * 0.5);
  const score = 55 + providerCoverage + completionBoost - supplyPenalty;

  return buildScore(
    score,
    [
      `${metrics.activeProviders}/${metrics.totalProviders} providers are active.`,
      `${metrics.providerSupplyGaps} provider supply gaps and ${metrics.unassignedJobs} unassigned jobs detected.`,
    ],
    [
      "Recruit providers in shortage categories.",
      "Coach providers with low response rates.",
      "Use manual assignment when marketplace liquidity is thin.",
    ]
  );
}
