import type { ServiceCategory } from "@/types";
import { seasonalDemandMultiplier } from "./seasonalDemandRules";

export interface DemandForecast {
  serviceArea: string;
  category: ServiceCategory;
  expectedJobs: number;
  demandLevel: "low" | "medium" | "high";
  highDemandWindows: string[];
  explanation: string;
}

export function forecastDemand(input: { serviceArea: string; category: ServiceCategory; trailingJobs: number; providerCount: number }): DemandForecast {
  const multiplier = seasonalDemandMultiplier(input.category);
  const expectedJobs = Math.round(Math.max(2, input.trailingJobs * multiplier + 3));
  return {
    serviceArea: input.serviceArea,
    category: input.category,
    expectedJobs,
    demandLevel: expectedJobs > 25 ? "high" : expectedJobs > 10 ? "medium" : "low",
    highDemandWindows: ["8am-11am", "4pm-7pm"],
    explanation: `Expected jobs use trailing volume ${input.trailingJobs}, seasonal multiplier ${multiplier}, and provider count ${input.providerCount}.`,
  };
}
