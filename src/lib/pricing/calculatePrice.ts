import { calculatePlatformFee } from "@/lib/payments/calculatePlatformFee";
import { calculateComplexityAdjustment } from "./complexityPricing";
import { calculateDiagnosticFee } from "./diagnosticPricing";
import { calculateLocationAdjustment } from "./locationPricing";
import { buildPriceExplanation } from "./priceExplanation";
import { getBasePrice, getPricingMode } from "./pricingRules";
import { calculateSurgeAdjustment } from "./surgePricing";
import { calculateUrgencyAdjustment } from "./urgencyPricing";
import type { PricingInput, PricingResult } from "./types";

export function calculatePrice(input: PricingInput): PricingResult {
  const profile = input.pricingProfile;
  const basePrice = profile ? profile.base_price_cents : getBasePrice(input.category);
  const pricingMode = getPricingMode(input.category, input.urgency === "emergency");
  const laborAdjustment = profile
    ? Math.max(0, Math.round((input.laborHours ?? 1) - 1) * profile.labor_rate_cents)
    : Math.max(0, Math.round((input.laborHours ?? 1) - 1) * 6500);
  const materialsEstimate = Math.max(0, input.materialsEstimateCents ?? 0);
  const urgencyAdjustment = profile
    ? Math.round(basePrice * (profile.urgency_multiplier - 1))
    : calculateUrgencyAdjustment(basePrice, input.urgency);
  const locationAdjustment = profile ? (profile.travel_fee_cents || 0) : calculateLocationAdjustment(basePrice, input.state, input.zip);
  const complexityAdjustment = calculateComplexityAdjustment(basePrice, input.complexity);
  const commercialAdjustment = profile && input.isCommercial ? Math.round(basePrice * (profile.commercial_multiplier - 1)) : 0;
  const surgeAdjustment = calculateSurgeAdjustment(basePrice, input.urgency) + commercialAdjustment;
  const diagnosticFee = pricingMode === "diagnostic_fee" ? calculateDiagnosticFee(input.category) : 0;
  const subtotal = basePrice + laborAdjustment + materialsEstimate + urgencyAdjustment + locationAdjustment + complexityAdjustment + surgeAdjustment;
  const cappedSubtotal = input.urgency === "emergency"
    ? Math.min(subtotal, Math.round(basePrice * (input.emergencyCapMultiplier ?? 2.25)))
    : subtotal;
  const platformFee = calculatePlatformFee(cappedSubtotal);
  const finalPrice = cappedSubtotal + platformFee;
  const depositRequired = pricingMode === "deposit_plus_balance" || pricingMode === "emergency_dynamic"
    ? Math.round(finalPrice * 0.3)
    : pricingMode === "diagnostic_fee"
      ? diagnosticFee
      : 0;
  const riskFlags = [
    input.urgency === "emergency" && subtotal !== cappedSubtotal ? "emergency_price_capped" : null,
    input.quotedAmountCents && input.quotedAmountCents > finalPrice * 1.35 ? "quote_above_recommended_range" : null,
  ].filter(Boolean) as string[];
  const baseResult = {
    pricingMode,
    basePrice,
    laborAdjustment,
    materialsEstimate,
    urgencyAdjustment,
    locationAdjustment,
    complexityAdjustment,
    surgeAdjustment,
    platformFee,
    diagnosticFee,
    depositRequired,
    finalPrice,
    riskFlags,
    confidenceScore: riskFlags.length ? 72 : 88,
  };
  return { ...baseResult, ...buildPriceExplanation(baseResult) };
}
