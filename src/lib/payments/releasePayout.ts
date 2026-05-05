import { canReleasePayout } from "./paymentRules";
import type { PaymentActionResult, PaymentContext } from "./types";
import { calculatePlatformFee } from "./calculatePlatformFee";

export function releasePayout(input: PaymentContext & { jobStatus?: string; hasOpenDispute?: boolean }): PaymentActionResult {
  const allowed = canReleasePayout(input);
  const platformFeeCents = calculatePlatformFee(input.amountCents);
  return {
    status: allowed.allowed ? "payout_released" : "payout_hold",
    amountCents: input.amountCents,
    platformFeeCents,
    providerPayoutCents: allowed.allowed ? Math.max(0, input.amountCents - platformFeeCents) : 0,
    riskFlags: allowed.allowed ? [] : ["payout_hold_required"],
    message: allowed.reason,
    metadata: input.metadata ?? {},
  };
}
