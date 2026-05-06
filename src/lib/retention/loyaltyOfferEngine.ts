export function recommendLoyaltyOffer(input: { completedJobs: number; churnRiskScore: number }) {
  if (input.churnRiskScore > 70) return { offer: "15% comeback credit", reason: "High churn risk warrants a save offer." };
  if (input.completedJobs >= 5) return { offer: "Priority booking perk", reason: "Repeat customer qualifies for loyalty recognition." };
  return { offer: "Referral credit", reason: "Encourage network growth after first service." };
}
