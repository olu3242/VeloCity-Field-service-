import type { ServiceCategory } from "@/types";

export function recommendRebookingWindow(category: ServiceCategory): { days: number; reason: string } {
  const rules: Partial<Record<ServiceCategory, number>> = {
    cleaning: 30,
    hvac: 90,
    plumbing: 21,
    landscaping: 14,
    handyman: 60,
  };
  const days = rules[category] ?? 120;
  return { days, reason: `${category} customers should be prompted after ${days} days.` };
}
