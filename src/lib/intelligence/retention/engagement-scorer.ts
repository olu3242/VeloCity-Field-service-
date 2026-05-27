/**
 * Engagement Scorer — multi-dimensional engagement scoring for customers and providers.
 */

export interface EngagementScore {
  entityId: string;
  entityType: "customer" | "provider";
  score: number;
  trend: "improving" | "stable" | "declining";
  components: {
    activityScore: number;
    qualityScore: number;
    satisfactionScore: number;
    loyaltyScore: number;
  };
  lifecycleStage: "onboarding" | "active" | "at_risk" | "dormant" | "churned";
}

export interface EngagementInput {
  entityId: string;
  entityType: "customer" | "provider";
  totalJobs: number;
  jobsLast30d: number;
  avgRating: number;
  daysSinceLastActivity: number;
  membershipDays: number;
}

function computeLifecycle(
  totalJobs: number,
  jobsLast30d: number,
  daysSinceLastActivity: number
): EngagementScore["lifecycleStage"] {
  if (jobsLast30d > 3) return "active";
  if (daysSinceLastActivity < 14) return "active";
  if (totalJobs < 2) return "onboarding";
  if (daysSinceLastActivity > 90) return "churned";
  if (daysSinceLastActivity > 30) return "dormant";
  return "at_risk";
}

function computeTrend(
  jobsLast30d: number,
  totalJobs: number
): EngagementScore["trend"] {
  if (totalJobs === 0) return "stable";
  if (jobsLast30d > totalJobs / 6) return "improving";
  if (jobsLast30d < totalJobs / 12) return "declining";
  return "stable";
}

export function scoreEngagement(input: EngagementInput): EngagementScore {
  const activityScore = Math.min(
    100,
    input.jobsLast30d * 15 + Math.max(0, 30 - input.daysSinceLastActivity) * 2
  );
  const qualityScore = (input.avgRating / 5) * 100;
  const satisfactionScore = Math.min(100, input.avgRating * 20);
  const loyaltyScore = Math.min(
    100,
    input.membershipDays / 3 + input.totalJobs * 2
  );

  const score =
    activityScore * 0.3 +
    qualityScore * 0.3 +
    satisfactionScore * 0.2 +
    loyaltyScore * 0.2;

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    score: Math.round(score * 10) / 10,
    trend: computeTrend(input.jobsLast30d, input.totalJobs),
    components: {
      activityScore: Math.round(activityScore * 10) / 10,
      qualityScore: Math.round(qualityScore * 10) / 10,
      satisfactionScore: Math.round(satisfactionScore * 10) / 10,
      loyaltyScore: Math.round(loyaltyScore * 10) / 10,
    },
    lifecycleStage: computeLifecycle(input.totalJobs, input.jobsLast30d, input.daysSinceLastActivity),
  };
}

export function batchScoreEngagement(entities: EngagementInput[]): EngagementScore[] {
  return entities.map(scoreEngagement);
}
