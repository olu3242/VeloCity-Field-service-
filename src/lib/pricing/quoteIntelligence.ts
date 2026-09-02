// Quote Intelligence — wraps the existing calculatePrice() pipeline
// (Rule 1: extend, don't duplicate the pricing engine) and exposes it under
// the Labor/Materials/Travel/Risk/Margin/Recommended-Quote naming from the
// Provider Excellence directive. Every figure here is a relabeled read of a
// value calculatePrice() already computed from category/urgency/location/
// complexity/materials inputs — no new pricing logic is introduced.

import { calculatePrice } from "./calculatePrice";
import type { PricingInput } from "./types";

export interface QuoteIntelligenceResult {
  laborEstimateCents: number;
  materialsEstimateCents: number;
  travelEstimateCents: number;
  riskEstimate: { flags: string[]; confidenceScore: number };
  marginEstimateCents: number;
  marginPercent: number;
  recommendedQuoteCents: number;
  customerExplanation: string;
  providerExplanation: string;
}

/** Computes a full quote breakdown from real job inputs via the existing pricing engine. */
export function generateQuoteIntelligence(input: PricingInput): QuoteIntelligenceResult {
  const priced = calculatePrice(input);

  // Platform fee is the platform's margin on this job; already computed by
  // calculatePrice() from the same subtotal that produces finalPrice.
  const marginEstimateCents = priced.platformFee;
  const marginPercent = priced.finalPrice > 0 ? Math.round((marginEstimateCents / priced.finalPrice) * 1000) / 10 : 0;

  return {
    laborEstimateCents: priced.basePrice + priced.laborAdjustment,
    materialsEstimateCents: priced.materialsEstimate,
    travelEstimateCents: priced.locationAdjustment,
    riskEstimate: { flags: priced.riskFlags, confidenceScore: priced.confidenceScore },
    marginEstimateCents,
    marginPercent,
    recommendedQuoteCents: priced.finalPrice,
    customerExplanation: priced.customerExplanation,
    providerExplanation: priced.providerExplanation,
  };
}
