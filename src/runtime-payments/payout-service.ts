import { Payment, PayoutRecord } from "./payment-types";

const PROVIDER_RATE = 0.82;

export function calculateProviderPayout(totalCents: number): number {
  return Math.floor(totalCents * PROVIDER_RATE);
}

export function schedulePayout(payment: Payment, providerId: string): PayoutRecord {
  return {
    id: `payout-${payment.id}-${Date.now()}`,
    providerId,
    paymentId: payment.id,
    amountCents: payment.providerPayoutCents,
    status: "pending",
    scheduledAt: new Date().toISOString(),
  };
}

export function getPayoutSummary(payouts: PayoutRecord[]): {
  totalCents: number;
  pendingCents: number;
  failedCount: number;
} {
  const totalCents = payouts.reduce((sum, p) => sum + p.amountCents, 0);
  const pendingCents = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const failedCount = payouts.filter((p) => p.status === "failed").length;
  return { totalCents, pendingCents, failedCount };
}
