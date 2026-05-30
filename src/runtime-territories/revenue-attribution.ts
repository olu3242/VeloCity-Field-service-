import { Territory, RevenueAttribution } from "./territory-types";

/** Platform fee rate: 18% of gross revenue. */
const PLATFORM_FEE_RATE = 0.18;

/** Franchise royalty rate: 8% of gross revenue. */
const FRANCHISE_ROYALTY_RATE = 0.08;

/** Provider payout rate: 74% of gross revenue. */
const PROVIDER_PAYOUT_RATE = 0.74;

/**
 * Calculate the platform fee (18% of gross revenue), rounded down to the
 * nearest cent.
 */
export function calculatePlatformFee(revenueCents: number): number {
  return Math.floor(revenueCents * PLATFORM_FEE_RATE);
}

/**
 * Calculate the franchise royalty amount using the supplied royalty rate.
 * The `royaltyRate` parameter is a decimal fraction (e.g. 0.08 for 8%).
 */
export function calculateFranchiseRoyalty(
  revenueCents: number,
  royaltyRate: number
): number {
  return Math.floor(revenueCents * royaltyRate);
}

/**
 * Attribute revenue from a single job across platform, franchise owner, and
 * provider buckets.
 *
 * Split (of gross):
 *   Platform fee       18 %
 *   Franchise royalty   8 %  (0 if no territory / no franchise owner)
 *   Provider payout    74 %  (82 % when there is no franchise owner)
 *
 * Integer arithmetic is used throughout; any sub-cent remainder from rounding
 * is absorbed into the provider payout so that the three buckets always sum
 * to `totalCents`.
 */
export function attributeRevenue(
  jobId: string,
  totalCents: number,
  territory: Territory | null
): RevenueAttribution {
  const territoryId = territory?.id ?? "";
  const hasFranchiseOwner =
    territory !== null &&
    territory.franchiseOwnerId !== undefined &&
    territory.franchiseOwnerId !== "";

  const platformFeeCents = calculatePlatformFee(totalCents);

  const franchiseRoyaltyCents = hasFranchiseOwner
    ? calculateFranchiseRoyalty(totalCents, FRANCHISE_ROYALTY_RATE)
    : 0;

  // Provider payout absorbs any rounding remainder.
  const providerPayoutCents =
    totalCents - platformFeeCents - franchiseRoyaltyCents;

  return {
    jobId,
    territoryId,
    totalCents,
    platformFeeCents,
    providerPayoutCents,
    franchiseRoyaltyCents,
  };
}

// Self-check: named constant kept for documentation.
void PROVIDER_PAYOUT_RATE;
