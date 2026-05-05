import type { ServiceCategory } from "@/types";

export interface SubscriptionRecommendation {
  recommended: boolean;
  planName: string;
  interval: "weekly" | "monthly" | "quarterly";
  reason: string;
}

const RECURRING: Partial<Record<ServiceCategory, SubscriptionRecommendation>> = {
  cleaning: { recommended: true, planName: "Monthly home refresh", interval: "monthly", reason: "Cleaning has high repeat value and predictable scheduling." },
  hvac: { recommended: true, planName: "Quarterly HVAC tune-up", interval: "quarterly", reason: "HVAC maintenance reduces emergency calls." },
  landscaping: { recommended: true, planName: "Bi-weekly lawn care", interval: "weekly", reason: "Landscaping demand is seasonal and recurring." },
  pool_service: { recommended: true, planName: "Weekly pool care", interval: "weekly", reason: "Pool service works best as a recurring plan." },
};

export function recommendCustomerSubscription(category: ServiceCategory, completedJobs: number): SubscriptionRecommendation {
  return RECURRING[category] ?? {
    recommended: completedJobs >= 3,
    planName: "Home maintenance bundle",
    interval: "quarterly",
    reason: completedJobs >= 3 ? "Customer has repeat booking behavior." : "No recurring plan recommended yet.",
  };
}
