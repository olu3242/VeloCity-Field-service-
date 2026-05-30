export function getRevenueGrowthRate(currentCents: number, previousCents: number): number {
  if (previousCents === 0) return 0;
  return (currentCents - previousCents) / previousCents;
}

export function getARPU(revenueCents: number, userCount: number): number {
  if (userCount === 0) return 0;
  return Math.floor(revenueCents / userCount);
}

export function getLTV(avgMonthlyRevenueCents: number, avgLifetimeMonths: number): number {
  return Math.floor(avgMonthlyRevenueCents * avgLifetimeMonths);
}

export function getChurnRate(lost: number, total: number): number {
  if (total === 0) return 0;
  return lost / total;
}
