import { scoreResult, type ScoreResult } from "./types";

export interface CustomerTrustInput {
  completedJobs?: number;
  cancelledJobs?: number;
  disputesOpened?: number;
  paymentFailures?: number;
  averageRatingGiven?: number | null;
}

export function calculateCustomerTrustScore(input: CustomerTrustInput): ScoreResult {
  const completed = Math.min(input.completedJobs ?? 0, 20) * 3;
  const rating = ((input.averageRatingGiven ?? 4.5) / 5) * 20;
  const penalties = (input.cancelledJobs ?? 0) * 8 + (input.disputesOpened ?? 0) * 12 + (input.paymentFailures ?? 0) * 15;
  const score = 35 + completed + rating - penalties;

  return scoreResult(
    score,
    [
      `${input.completedJobs ?? 0} completed jobs indicate booking history.`,
      `${input.disputesOpened ?? 0} disputes and ${input.paymentFailures ?? 0} payment failures affect trust.`,
    ],
    [
      "Offer clear estimate ranges before dispatch.",
      "Use deposits for customers with limited history or payment issues.",
    ],
    { inverted: true }
  );
}
