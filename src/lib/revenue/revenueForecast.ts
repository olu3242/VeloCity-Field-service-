import type { ServiceCategory } from "@/types";

export interface RevenueForecastInput {
  territory: string;
  category: ServiceCategory;
  historicalRevenueCents: number;
  jobCount: number;
  demandGrowthRate?: number;
}

export interface RevenueForecast {
  territory: string;
  category: ServiceCategory;
  projectedRevenueCents: number;
  confidence: number;
  explanation: string;
}

export function forecastRevenue(input: RevenueForecastInput): RevenueForecast {
  const averageTicket = input.jobCount > 0 ? input.historicalRevenueCents / input.jobCount : 15000;
  const projectedJobs = Math.max(input.jobCount, 3) * (1 + (input.demandGrowthRate ?? 0.08));
  return {
    territory: input.territory,
    category: input.category,
    projectedRevenueCents: Math.round(projectedJobs * averageTicket),
    confidence: input.jobCount >= 10 ? 0.78 : 0.52,
    explanation: `Forecast uses ${input.jobCount} jobs, average ticket ${Math.round(averageTicket)} cents, and growth ${(input.demandGrowthRate ?? 0.08) * 100}%.`,
  };
}
