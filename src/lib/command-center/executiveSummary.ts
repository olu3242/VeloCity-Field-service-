import type { CommandCenterMetrics, CommandCenterScore } from "./types";

export interface ExecutiveSummary {
  headline: string;
  narrative: string;
  riskPosture: "stable" | "watch" | "at_risk";
}

export function buildExecutiveSummary(input: {
  metrics: CommandCenterMetrics;
  ops: CommandCenterScore;
  revenue: CommandCenterScore;
  automation: CommandCenterScore;
  marketplace: CommandCenterScore;
}): ExecutiveSummary {
  const average = Math.round((input.ops.score + input.revenue.score + input.automation.score + input.marketplace.score) / 4);
  const riskPosture = average >= 75 ? "stable" : average >= 55 ? "watch" : "at_risk";
  return {
    headline: `Command center health is ${average}/100`,
    riskPosture,
    narrative: `${input.metrics.activeJobs} active jobs, ${input.metrics.disputes} disputes, ${input.metrics.paymentFailures} payment failures, and ${input.metrics.providerSupplyGaps} provider gaps are shaping today's operating posture.`,
  };
}
