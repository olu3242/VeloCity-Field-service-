import type { ServiceCategory } from "@/types";

export interface CommissionResult {
  commissionRate: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  explanation: string;
}

const CATEGORY_COMMISSION: Partial<Record<ServiceCategory, number>> = {
  cleaning: 0.16,
  landscaping: 0.17,
  moving: 0.18,
  roofing: 0.14,
  hvac: 0.16,
};

export function calculateCommission(category: ServiceCategory, amountCents: number): CommissionResult {
  const commissionRate = CATEGORY_COMMISSION[category] ?? (amountCents > 50000 ? 0.15 : 0.18);
  const platformFeeCents = Math.round(amountCents * commissionRate);
  return {
    commissionRate,
    platformFeeCents,
    providerPayoutCents: amountCents - platformFeeCents,
    explanation: `${Math.round(commissionRate * 100)}% platform commission for ${category}.`,
  };
}
