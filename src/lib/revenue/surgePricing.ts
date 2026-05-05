import type { ServiceCategory, UrgencyLevel } from "@/types";

export interface SurgePricingInput {
  category: ServiceCategory;
  urgency: UrgencyLevel;
  demandIndex: number;
  availableProviders: number;
  openJobs: number;
}

export interface SurgePricingRecommendation {
  multiplier: number;
  surchargeRate: number;
  explanation: string;
  shouldApply: boolean;
}

export function recommendSurgePricing(input: SurgePricingInput): SurgePricingRecommendation {
  const supplyRatio = input.openJobs / Math.max(input.availableProviders, 1);
  const demandPressure = input.demandIndex / 100;
  const urgencyPressure = input.urgency === "emergency" ? 0.2 : input.urgency === "same_day" ? 0.08 : 0;
  const surchargeRate = Math.min(0.3, Math.max(0, (supplyRatio - 1) * 0.05 + demandPressure * 0.08 + urgencyPressure));
  return {
    multiplier: Number((1 + surchargeRate).toFixed(2)),
    surchargeRate: Number(surchargeRate.toFixed(2)),
    shouldApply: surchargeRate >= 0.08,
    explanation: `Surge is based on demand index ${input.demandIndex}, ${input.availableProviders} providers, and ${input.openJobs} open jobs.`,
  };
}
