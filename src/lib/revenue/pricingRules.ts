import type { ServiceCategory, UrgencyLevel } from "@/types";

export interface PriceAdjustment {
  label: string;
  amountCents: number;
  reason: string;
}

export const CATEGORY_BASE_DIAGNOSTIC_FEE_CENTS: Record<ServiceCategory, number> = {
  plumbing: 7900,
  electrical: 8900,
  hvac: 9900,
  cleaning: 0,
  landscaping: 4900,
  pest_control: 6900,
  appliance_repair: 8900,
  locksmith: 7900,
  handyman: 6900,
  painting: 4900,
  roofing: 12900,
  flooring: 7900,
  carpentry: 7900,
  moving: 0,
  pool_service: 6900,
  garage_door: 8900,
  windows: 4900,
  other: 6900,
};

export const URGENCY_SURCHARGE_RATE: Record<UrgencyLevel, number> = {
  scheduled: 0,
  same_day: 0.15,
  emergency: 0.5,
};

export function recommendDiagnosticFee(category: ServiceCategory, urgency: UrgencyLevel): PriceAdjustment {
  const base = CATEGORY_BASE_DIAGNOSTIC_FEE_CENTS[category];
  const surcharge = Math.round(base * URGENCY_SURCHARGE_RATE[urgency]);
  return {
    label: "Diagnostic fee",
    amountCents: base + surcharge,
    reason: surcharge > 0 ? `${urgency} urgency increases provider availability cost.` : "Standard category diagnostic fee.",
  };
}

export function explainPriceAdjustments(adjustments: PriceAdjustment[]): string[] {
  return adjustments.map((adjustment) => `${adjustment.label}: ${adjustment.reason}`);
}
