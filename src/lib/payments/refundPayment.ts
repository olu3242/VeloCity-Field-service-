import type { PaymentActionResult, PaymentContext } from "./types";

export function refundPayment(input: PaymentContext, partialAmountCents = input.amountCents): PaymentActionResult {
  return {
    status: "refunded",
    amountCents: Math.min(partialAmountCents, input.amountCents),
    platformFeeCents: 0,
    providerPayoutCents: 0,
    riskFlags: partialAmountCents < input.amountCents ? ["partial_refund"] : [],
    message: "Refund recorded.",
    metadata: input.metadata ?? {},
  };
}
