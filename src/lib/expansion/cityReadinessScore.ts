import { calculateFranchiseReadinessScore } from "@/lib/scoring";

export function calculateCityReadinessScore(input: { demandIndex: number; providerCount: number; activeCustomers: number; monthlyRevenueCents: number }) {
  return calculateFranchiseReadinessScore({
    territoryHealthScore: Math.min(100, input.demandIndex + input.providerCount * 2),
    monthlyRevenueCents: input.monthlyRevenueCents,
    providerCount: input.providerCount,
    activeCustomers: input.activeCustomers,
    monthOverMonthGrowth: 8,
  });
}
