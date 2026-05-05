import type { QuoteLineItem, UrgencyLevel } from "@/types";
import { scoreResult, type ScoreResult } from "./types";

export interface QuoteFairnessInput {
  lineItems?: QuoteLineItem[];
  totalCents?: number;
  estimatedMinCents?: number;
  estimatedMaxCents?: number;
  urgency?: UrgencyLevel | string | null;
}

export function calculateQuoteFairnessScore(input: QuoteFairnessInput): ScoreResult {
  const total = input.totalCents ?? input.lineItems?.reduce((sum, item) => sum + item.total_cents, 0) ?? 0;
  const min = input.estimatedMinCents ?? Math.round(total * 0.7);
  const max = input.estimatedMaxCents ?? Math.round(total * (input.urgency === "emergency" ? 1.45 : 1.25));
  const lineMismatch = input.lineItems?.some((item) => Math.round(item.quantity * item.unit_price_cents) !== item.total_cents) ?? false;
  let score = 88;
  if (total < min) score -= 8;
  if (total > max) score -= Math.min(40, ((total - max) / Math.max(max, 1)) * 60);
  if (lineMismatch) score -= 25;

  return scoreResult(
    score,
    [
      `Quote total is ${total} cents against expected range ${min}-${max} cents.`,
      lineMismatch ? "One or more line items do not reconcile." : "Line item totals reconcile.",
    ],
    [
      "Request breakdown for quotes outside expected range.",
      "Show customers surcharge reasons before approval.",
    ],
    { inverted: true }
  );
}
