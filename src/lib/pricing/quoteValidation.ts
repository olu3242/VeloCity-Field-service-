import type { PricingResult, QuoteValidationResult } from "./types";

export function validateQuote(submittedCents: number, engine: PricingResult): QuoteValidationResult {
  const fairRange = { min: Math.round(engine.finalPrice * 0.75), max: Math.round(engine.finalPrice * 1.25) };
  const variancePercent = engine.finalPrice ? Math.round(((submittedCents - engine.finalPrice) / engine.finalPrice) * 1000) / 10 : 0;
  const riskFlags: string[] = [];
  if (submittedCents > fairRange.max) riskFlags.push("quote_too_high");
  if (submittedCents < fairRange.min) riskFlags.push("quote_too_low");
  const status = submittedCents > Math.round(engine.finalPrice * 1.6) ? "rejected" : riskFlags.length ? "flagged" : "approved";
  return {
    status,
    variancePercent,
    fairRange,
    riskFlags,
    customerExplanation: status === "approved" ? "This quote is within the expected fair range." : "This quote needs review because it falls outside the expected range.",
    adminSummary: `Submitted quote varies ${variancePercent}% from engine recommendation.`,
  };
}
