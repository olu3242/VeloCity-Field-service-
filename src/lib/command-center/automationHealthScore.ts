import { buildScore, type CommandCenterMetrics, type CommandCenterScore } from "./types";

export function calculateAutomationHealthScore(metrics: CommandCenterMetrics): CommandCenterScore {
  const activityBoost = Math.min(25, metrics.aiAgentActivity * 2);
  const failurePenalty = metrics.failedAutomations * 18;
  const score = 75 + activityBoost - failurePenalty;

  return buildScore(
    score,
    [
      `${metrics.aiAgentActivity} AI agent activities were recorded recently.`,
      `${metrics.failedAutomations} failed automations require review.`,
    ],
    [
      "Route failed automation events to ops review.",
      "Compare agent activity volume against job volume daily.",
      "Add deterministic fallback checks for every automation path.",
    ]
  );
}
