import type { ServiceCategory } from "@/types";

export function generateLaunchPlaybook(input: { city: string; zipCodes: string[]; categories: ServiceCategory[]; providersNeeded: number }) {
  return {
    city: input.city,
    checklist: [
      `Recruit ${input.providersNeeded} verified providers.`,
      `Launch first in ZIPs: ${input.zipCodes.slice(0, 5).join(", ")}.`,
      `Prioritize categories: ${input.categories.join(", ")}.`,
      "Confirm insurance, background checks, and SLA expectations.",
      "Run first 25 jobs with admin dispatch review.",
    ],
  };
}
