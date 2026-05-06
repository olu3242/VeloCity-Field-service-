import { buildScore, type CommandCenterMetrics, type CommandCenterScore } from "./types";

export function calculateOpsHealthScore(metrics: CommandCenterMetrics): CommandCenterScore {
  const totalOperationalLoad = metrics.activeJobs + metrics.unassignedJobs + metrics.disputes;
  const riskPenalty = metrics.unassignedJobs * 8 + metrics.slaBreaches * 12 + metrics.disputes * 7 + metrics.failedAutomations * 10;
  const providerCoverage = metrics.activeProviders ? Math.min(20, metrics.activeProviders * 2) : 0;
  const score = 82 + providerCoverage - riskPenalty - Math.max(0, totalOperationalLoad - 20) * 1.5;

  return buildScore(
    score,
    [
      `${metrics.activeJobs} active jobs and ${metrics.unassignedJobs} unassigned jobs are currently in flight.`,
      `${metrics.slaBreaches} SLA breaches and ${metrics.failedAutomations} failed automations need monitoring.`,
    ],
    [
      "Assign unclaimed jobs before provider response windows expire.",
      "Escalate SLA breaches to the admin dispatch queue.",
      "Review failed automations before end of day.",
    ]
  );
}
