export interface RevenueRecord {
  period: string; // "2026-05"
  tenantId: string;
  grossRevenueCents: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  franchiseRoyaltyCents: number;
  netRevenueCents: number;
  jobCount: number;
  avgJobValueCents: number;
}

export interface FranchiseRoyalty {
  franchiseId: string;
  territoryId: string;
  period: string;
  grossCents: number;
  royaltyRateBps: number; // basis points
  royaltyCents: number;
}
