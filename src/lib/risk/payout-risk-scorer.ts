export interface PayoutRiskInput {
  tenantId: string;
  providerId: string;
  amountUsd: number;
  daysSinceLastPayout?: number;
  priorDisputeCount?: number;
  verificationStatus?: "verified" | "pending" | "unverified";
}

export interface PayoutRiskScore {
  providerId: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: string[];
  recommendedAction: "approve" | "review" | "hold" | "block";
}

export function scorePayoutRisk(input: PayoutRiskInput): PayoutRiskScore {
  let score = 0;
  const factors: string[] = [];

  if (input.amountUsd > 50000) {
    score += 40;
    factors.push("Amount exceeds $50,000");
  } else if (input.amountUsd > 10000) {
    score += 20;
    factors.push("Amount exceeds $10,000");
  } else if (input.amountUsd > 1000) {
    score += 10;
    factors.push("Amount exceeds $1,000");
  }

  const disputes = input.priorDisputeCount ?? 0;
  if (disputes > 2) {
    score += 30;
    factors.push("More than 2 prior disputes");
  } else if (disputes > 0) {
    score += 15;
    factors.push("Prior dispute history");
  }

  if (input.verificationStatus === "unverified") {
    score += 25;
    factors.push("Provider unverified");
  } else if (input.verificationStatus === "pending") {
    score += 10;
    factors.push("Verification pending");
  }

  if (input.daysSinceLastPayout !== undefined) {
    if (input.daysSinceLastPayout > 90) {
      score += 20;
      factors.push("No payout in over 90 days");
    } else if (input.daysSinceLastPayout < 1) {
      score += 15;
      factors.push("Payout frequency too high");
    }
  }

  const riskLevel: PayoutRiskScore["riskLevel"] =
    score >= 80
      ? "critical"
      : score >= 60
      ? "high"
      : score >= 30
      ? "medium"
      : "low";

  const recommendedAction: PayoutRiskScore["recommendedAction"] =
    riskLevel === "critical"
      ? "block"
      : riskLevel === "high"
      ? "hold"
      : riskLevel === "medium"
      ? "review"
      : "approve";

  return {
    providerId: input.providerId,
    riskScore: score,
    riskLevel,
    factors,
    recommendedAction,
  };
}

export function batchScorePayouts(inputs: PayoutRiskInput[]): PayoutRiskScore[] {
  return inputs.map(scorePayoutRisk);
}
