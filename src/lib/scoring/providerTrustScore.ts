import { scoreResult, type ScoreResult } from "./types";

export interface ProviderTrustInput {
  trustScore?: number | null;
  completedJobs?: number | null;
  cancellationRate?: number | null;
  averageRating?: number | null;
  responseTimeMinutes?: number | null;
  isApproved?: boolean;
}

export function calculateProviderTrustScore(input: ProviderTrustInput): ScoreResult {
  const trust = (input.trustScore ?? 0.5) * 45;
  const completion = Math.min(input.completedJobs ?? 0, 50) * 0.4;
  const rating = ((input.averageRating ?? 4) / 5) * 20;
  const cancellationPenalty = (input.cancellationRate ?? 0) * 25;
  const responsePenalty = Math.min(input.responseTimeMinutes ?? 20, 120) / 12;
  const approval = input.isApproved === false ? -20 : 10;
  const score = trust + completion + rating + approval - cancellationPenalty - responsePenalty;

  const reasons = [
    `Trust baseline contributes ${Math.round(trust)} points.`,
    `${input.completedJobs ?? 0} completed jobs improve reliability.`,
    `Cancellation rate is ${Math.round((input.cancellationRate ?? 0) * 100)}%.`,
  ];

  const recommendations = [
    "Keep response time under 15 minutes.",
    "Prioritize quote accuracy and completion confirmation.",
    "Request reviews after completed jobs to strengthen trust.",
  ];

  return scoreResult(score, reasons, recommendations, { inverted: true });
}
