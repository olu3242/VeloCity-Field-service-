import type { PricingMode } from "@/lib/pricing";
import type { PaymentAutomationState } from "./types";

export function initialPaymentStateForPricingMode(mode: PricingMode): PaymentAutomationState {
  if (mode === "fixed_price") return "payment_required";
  if (mode === "diagnostic_fee") return "payment_required";
  if (mode === "deposit_plus_balance" || mode === "emergency_dynamic") return "payment_required";
  if (mode === "subscription_recurring") return "payment_required";
  return "balance_required";
}

export function canReleasePayout(input: { jobStatus?: string | null; hasOpenDispute?: boolean; providerCompletedJobs?: number }) {
  if (input.hasOpenDispute) return { allowed: false, reason: "Open dispute freezes payout." };
  if (!["completed", "customer_confirmed", "closed"].includes(input.jobStatus ?? "")) {
    return { allowed: false, reason: "Job is not completed or customer confirmed." };
  }
  return { allowed: true, reason: "Payout release allowed by deterministic rules." };
}
