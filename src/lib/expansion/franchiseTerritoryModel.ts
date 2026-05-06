export function modelFranchiseTerritory(input: { territory: string; readinessScore: number; monthlyRevenueCents: number; providerCount: number }) {
  return {
    territory: input.territory,
    operatorRequirements: [
      "Local service operations experience",
      "Provider recruiting capability",
      "Customer dispute handling process",
      "Minimum launch capital for provider activation",
    ],
    recommended: input.readinessScore >= 70 && input.monthlyRevenueCents >= 500000 && input.providerCount >= 8,
  };
}
