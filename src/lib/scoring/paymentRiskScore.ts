import { scoreResult, type ScoreResult } from "./types";

export interface PaymentRiskInput {
  amountCents?: number;
  priorFailures?: number;
  customerTrustScore?: number;
  isEmergency?: boolean;
  hasDeposit?: boolean;
}

export function calculatePaymentRiskScore(input: PaymentRiskInput): ScoreResult {
  let score = 15;
  if ((input.amountCents ?? 0) > 50000) score += 12;
  if ((input.amountCents ?? 0) > 150000) score += 20;
  score += (input.priorFailures ?? 0) * 18;
  if ((input.customerTrustScore ?? 75) < 55) score += 14;
  if (input.isEmergency) score += 8;
  if (!input.hasDeposit) score += 10;

  return scoreResult(
    score,
    [`Payment amount is ${input.amountCents ?? 0} cents.`, `${input.priorFailures ?? 0} prior payment failures detected.`],
    ["Require deposit for higher risk payments.", "Use manual review before payout when risk is high."]
  );
}
