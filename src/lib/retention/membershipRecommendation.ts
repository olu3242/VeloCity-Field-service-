import type { ServiceCategory } from "@/types";
import { recommendCustomerSubscription } from "@/lib/revenue";

export function recommendMembership(category: ServiceCategory, completedJobs: number) {
  const subscription = recommendCustomerSubscription(category, completedJobs);
  return {
    recommended: subscription.recommended,
    planName: subscription.planName,
    reason: subscription.reason,
  };
}
