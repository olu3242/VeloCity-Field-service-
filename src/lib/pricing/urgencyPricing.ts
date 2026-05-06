import type { UrgencyLevel } from "@/types";

export function calculateUrgencyAdjustment(basePrice: number, urgency: UrgencyLevel): number {
  if (urgency === "emergency") return Math.min(Math.round(basePrice * 0.75), basePrice);
  if (urgency === "same_day") return Math.round(basePrice * 0.25);
  return 0;
}
