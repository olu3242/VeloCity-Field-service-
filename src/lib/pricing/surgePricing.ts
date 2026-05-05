import type { UrgencyLevel } from "@/types";

export function calculateSurgeAdjustment(basePrice: number, urgency: UrgencyLevel, localDemandIndex = 50): number {
  if (localDemandIndex < 75) return 0;
  const multiplier = urgency === "emergency" ? 0.3 : 0.15;
  return Math.min(Math.round(basePrice * multiplier), Math.round(basePrice * 0.4));
}
