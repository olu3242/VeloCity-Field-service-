import { FranchiseRoyalty } from "./revenue-types";

const ROYALTY_RATES_BPS: Record<"standard" | "premium" | "enterprise", number> = {
  standard: 800,
  premium: 700,
  enterprise: 600,
};

export function calculateRoyalty(grossCents: number, rateBps: number): number {
  return Math.floor((grossCents * rateBps) / 10000);
}

export function buildRoyaltyRecord(
  franchiseId: string,
  territoryId: string,
  period: string,
  grossCents: number
): FranchiseRoyalty {
  const royaltyRateBps = ROYALTY_RATES_BPS.standard;
  const royaltyCents = calculateRoyalty(grossCents, royaltyRateBps);
  return {
    franchiseId,
    territoryId,
    period,
    grossCents,
    royaltyRateBps,
    royaltyCents,
  };
}

export function getRoyaltyRateForTier(tier: "standard" | "premium" | "enterprise"): number {
  return ROYALTY_RATES_BPS[tier];
}
