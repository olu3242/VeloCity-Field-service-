import { Payment, RefundRecord } from "./payment-types";

export function initiateRefund(
  paymentId: string,
  amountCents: number,
  reason: string
): RefundRecord {
  return {
    id: `refund-${paymentId}-${Date.now()}`,
    paymentId,
    amountCents,
    reason,
    status: "pending",
  };
}

export function calculateRefundAmount(
  payment: Payment,
  refundType: "full" | "partial",
  partialPercent?: number
): number {
  if (refundType === "full") return payment.amountCents;
  const pct = partialPercent !== undefined ? partialPercent : 0;
  return Math.floor(payment.amountCents * (pct / 100));
}

export function isRefundable(payment: Payment): boolean {
  return payment.status === "captured" || payment.status === "escrowed";
}
