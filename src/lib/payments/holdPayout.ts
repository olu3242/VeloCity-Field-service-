import type { PaymentActionResult, PaymentContext } from "./types";

export function holdPayout(input: PaymentContext, reason = "Payout held for review."): PaymentActionResult {
  return {
    status: "payout_hold",
    amountCents: input.amountCents,
    platformFeeCents: 0,
    providerPayoutCents: 0,
    riskFlags: ["payout_hold"],
    message: reason,
    metadata: input.metadata ?? {},
  };
}
