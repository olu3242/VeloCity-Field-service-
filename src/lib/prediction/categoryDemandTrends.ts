import type { ServiceCategory } from "@/types";

export interface CategoryTrend {
  category: ServiceCategory;
  trend: "down" | "flat" | "up";
  changePercent: number;
}

export function calculateCategoryDemandTrend(category: ServiceCategory, currentJobs: number, previousJobs: number): CategoryTrend {
  const changePercent = previousJobs ? ((currentJobs - previousJobs) / previousJobs) * 100 : currentJobs ? 100 : 0;
  return {
    category,
    trend: changePercent > 10 ? "up" : changePercent < -10 ? "down" : "flat",
    changePercent: Math.round(changePercent),
  };
}
