import { scoreResult, type ScoreResult } from "./types";

export interface RetentionInput {
  daysSinceLastJob?: number;
  completedJobs?: number;
  lastRating?: number | null;
  openDisputes?: number;
  hasSubscription?: boolean;
  recurringCategory?: boolean;
}

export function calculateRetentionProbabilityScore(input: RetentionInput): ScoreResult {
  let score = 45;
  score += Math.min(input.completedJobs ?? 0, 10) * 4;
  score -= Math.min(input.daysSinceLastJob ?? 90, 180) * 0.18;
  score += ((input.lastRating ?? 4) - 3) * 8;
  score -= (input.openDisputes ?? 0) * 20;
  if (input.hasSubscription) score += 20;
  if (input.recurringCategory) score += 8;

  return scoreResult(
    score,
    [
      `${input.daysSinceLastJob ?? 90} days since last job.`,
      `${input.completedJobs ?? 0} completed jobs in customer history.`,
    ],
    ["Send maintenance reminder for recurring categories.", "Offer membership if customer has repeated bookings."],
    { inverted: true }
  );
}
