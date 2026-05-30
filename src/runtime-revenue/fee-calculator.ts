const PLATFORM_FEE_RATE = 0.18;
const PROVIDER_PAYOUT_RATE = 0.82;
const DEFAULT_FRANCHISE_RATE = 0.08;

export function getPlatformFee(grossCents: number): number {
  return Math.floor(grossCents * PLATFORM_FEE_RATE);
}

export function getProviderPayout(grossCents: number): number {
  return Math.floor(grossCents * PROVIDER_PAYOUT_RATE);
}

export function getNetRevenue(grossCents: number): number {
  const platformFee = getPlatformFee(grossCents);
  const franchiseRoyalty = Math.floor(grossCents * DEFAULT_FRANCHISE_RATE);
  return platformFee - franchiseRoyalty;
}

export function formatFeeSummary(grossCents: number): Record<string, number> {
  const platformFeeCents = getPlatformFee(grossCents);
  const franchiseRoyaltyCents = Math.floor(grossCents * DEFAULT_FRANCHISE_RATE);
  const providerPayoutCents = getProviderPayout(grossCents);
  const netRevenueCents = platformFeeCents - franchiseRoyaltyCents;
  return {
    grossCents,
    platformFeeCents,
    franchiseRoyaltyCents,
    providerPayoutCents,
    netRevenueCents,
  };
}
