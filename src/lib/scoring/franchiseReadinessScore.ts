import { scoreResult, type ScoreResult } from "./types";

export interface FranchiseReadinessInput {
  territoryHealthScore?: number;
  monthlyRevenueCents?: number;
  providerCount?: number;
  activeCustomers?: number;
  disputeRate?: number;
  monthOverMonthGrowth?: number;
  operatorCandidates?: number;
}

export function calculateFranchiseReadinessScore(input: FranchiseReadinessInput): ScoreResult {
  let score = (input.territoryHealthScore ?? 60) * 0.35;
  score += Math.min(input.monthlyRevenueCents ?? 0, 10000000) / 10000000 * 25;
  score += Math.min(input.providerCount ?? 0, 50) * 0.4;
  score += Math.min(input.activeCustomers ?? 0, 1000) * 0.015;
  score += Math.max(0, input.monthOverMonthGrowth ?? 0) * 0.8;
  score += Math.min(input.operatorCandidates ?? 0, 5) * 3;
  score -= (input.disputeRate ?? 0.03) * 100;

  return scoreResult(
    score,
    [
      `Territory health is ${input.territoryHealthScore ?? 60}.`,
      `${input.providerCount ?? 0} providers and ${input.activeCustomers ?? 0} active customers are present.`,
    ],
    ["Validate operator pipeline.", "Confirm unit economics before franchise launch.", "Document local playbook and provider SLAs."],
    { inverted: true }
  );
}
