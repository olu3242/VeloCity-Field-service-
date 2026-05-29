import { RevenueRecord } from "./revenue-types";

const PLATFORM_RATE = 0.18;
const FRANCHISE_RATE = 0.08;
const PROVIDER_RATE = 0.74;

export function splitRevenue(grossCents: number): {
  platformCents: number;
  providerCents: number;
  franchiseCents: number;
} {
  const platformCents = Math.floor(grossCents * PLATFORM_RATE);
  const franchiseCents = Math.floor(grossCents * FRANCHISE_RATE);
  const providerCents = grossCents - platformCents - franchiseCents;
  return { platformCents, providerCents, franchiseCents };
}

export function buildRevenueRecord(
  jobs: Array<{ finalCostCents: number }>,
  period: string,
  tenantId: string
): RevenueRecord {
  const jobCount = jobs.length;
  const grossRevenueCents = jobs.reduce((sum, j) => sum + j.finalCostCents, 0);
  const avgJobValueCents = jobCount > 0 ? Math.floor(grossRevenueCents / jobCount) : 0;
  const { platformCents, providerCents, franchiseCents } = splitRevenue(grossRevenueCents);

  return {
    period,
    tenantId,
    grossRevenueCents,
    platformFeeCents: platformCents,
    providerPayoutCents: providerCents,
    franchiseRoyaltyCents: franchiseCents,
    netRevenueCents: platformCents - franchiseCents,
    jobCount,
    avgJobValueCents,
  };
}
