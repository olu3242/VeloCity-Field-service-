import { calculatePlatformFee } from "./calculatePlatformFee";
import type { PaymentActionResult, PaymentContext } from "./types";

export function captureBalance(input: PaymentContext): PaymentActionResult {
  const platformFeeCents = calculatePlatformFee(input.amountCents);
  return {
    status: "paid",
    amountCents: input.amountCents,
    platformFeeCents,
    providerPayoutCents: Math.max(0, input.amountCents - platformFeeCents),
    riskFlags: [],
    message: "Balance captured.",
    metadata: input.metadata ?? {},
  };
}
