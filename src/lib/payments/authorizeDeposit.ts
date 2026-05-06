import { calculatePlatformFee } from "./calculatePlatformFee";
import type { PaymentActionResult, PaymentContext } from "./types";

export function authorizeDeposit(input: PaymentContext): PaymentActionResult {
  const platformFeeCents = calculatePlatformFee(input.amountCents);
  return {
    status: "deposit_authorized",
    amountCents: input.amountCents,
    platformFeeCents,
    providerPayoutCents: Math.max(0, input.amountCents - platformFeeCents),
    riskFlags: [],
    message: "Deposit authorized.",
    metadata: input.metadata ?? {},
  };
}
