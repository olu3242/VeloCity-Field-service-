import { scoreResult, type ScoreResult } from "./types";

export interface DisputeRiskInput {
  jobRiskScore?: number;
  quoteFairnessScore?: number;
  providerTrustScore?: number;
  customerTrustScore?: number;
  hasChangeOrder?: boolean;
  completionConfirmed?: boolean;
}

export function calculateDisputeRiskScore(input: DisputeRiskInput): ScoreResult {
  let score = 20;
  score += (input.jobRiskScore ?? 30) * 0.25;
  score += Math.max(0, 70 - (input.quoteFairnessScore ?? 80)) * 0.35;
  score += Math.max(0, 65 - (input.providerTrustScore ?? 75)) * 0.25;
  score += Math.max(0, 60 - (input.customerTrustScore ?? 75)) * 0.25;
  if (input.hasChangeOrder) score += 10;
  if (!input.completionConfirmed) score += 8;

  return scoreResult(
    score,
    [
      `Job risk contributes ${Math.round((input.jobRiskScore ?? 30) * 0.25)} points.`,
      input.hasChangeOrder ? "Change order present." : "No change order present.",
    ],
    ["Capture before/after photos.", "Keep quote and change order approvals explicit.", "Escalate high-risk jobs before payout."]
  );
}
