export interface ProviderPlanRecommendation {
  plan: "starter" | "growth" | "pro";
  reason: string;
  expectedBenefit: string;
}

export function recommendProviderPlan(input: { completedJobs: number; trustScore: number; monthlyRevenueCents: number }): ProviderPlanRecommendation {
  if (input.monthlyRevenueCents > 500000 || input.completedJobs > 40) {
    return { plan: "pro", reason: "High job volume and revenue justify lower commission and priority dispatch.", expectedBenefit: "Priority routing and advanced analytics." };
  }
  if (input.trustScore > 0.75 && input.completedJobs > 10) {
    return { plan: "growth", reason: "Provider has enough traction to benefit from boosted visibility.", expectedBenefit: "More offer volume in nearby service areas." };
  }
  return { plan: "starter", reason: "Provider is still building marketplace history.", expectedBenefit: "Focus on trust score and response time." };
}
