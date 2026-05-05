import type { PricingResult } from "./types";

export function buildPriceExplanation(result: Omit<PricingResult, "customerExplanation" | "providerExplanation">) {
  const adjustments = [
    result.urgencyAdjustment ? `urgency adjustment $${(result.urgencyAdjustment / 100).toFixed(2)}` : null,
    result.locationAdjustment ? `location adjustment $${(result.locationAdjustment / 100).toFixed(2)}` : null,
    result.complexityAdjustment ? `complexity adjustment $${(result.complexityAdjustment / 100).toFixed(2)}` : null,
    result.surgeAdjustment ? `surge adjustment $${(result.surgeAdjustment / 100).toFixed(2)}` : null,
  ].filter(Boolean);

  const customerExplanation = adjustments.length
    ? `The price includes a base service price plus ${adjustments.join(", ")}. No adjustment is hidden.`
    : "The price is based on the standard service price with no extra adjustment.";

  const providerExplanation = `Recommended final price is $${(result.finalPrice / 100).toFixed(2)} including platform fee $${(result.platformFee / 100).toFixed(2)}.`;
  return { customerExplanation, providerExplanation };
}
