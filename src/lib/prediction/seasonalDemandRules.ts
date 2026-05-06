import type { ServiceCategory } from "@/types";

export function seasonalDemandMultiplier(category: ServiceCategory, date = new Date()): number {
  const month = date.getMonth() + 1;
  if (category === "hvac" && [6, 7, 8, 12, 1].includes(month)) return 1.35;
  if (category === "landscaping" && [3, 4, 5, 6, 7, 8, 9].includes(month)) return 1.3;
  if (category === "pool_service" && [5, 6, 7, 8].includes(month)) return 1.4;
  if (category === "plumbing" && [12, 1, 2].includes(month)) return 1.15;
  if (category === "cleaning" && [11, 12, 3, 4].includes(month)) return 1.2;
  return 1;
}
