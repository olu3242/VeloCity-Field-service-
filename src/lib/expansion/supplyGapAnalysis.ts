import type { ServiceCategory } from "@/types";

export function analyzeSupplyGap(input: { category: ServiceCategory; expectedJobs: number; activeProviders: number }) {
  const providersNeeded = Math.max(0, Math.ceil(input.expectedJobs / 8) - input.activeProviders);
  return {
    category: input.category,
    providersNeeded,
    severity: providersNeeded > 5 ? "high" : providersNeeded > 0 ? "medium" : "low",
    explanation: `${input.expectedJobs} expected jobs require about ${Math.ceil(input.expectedJobs / 8)} providers.`,
  };
}
