import { Payment } from "./payment-types";

export function holdPayment(payment: Payment): Payment {
  return { ...payment, status: "escrowed" };
}

export function releasePayment(payment: Payment): Payment {
  return { ...payment, status: "released" };
}

export function getEscrowBalance(payments: Payment[]): number {
  return payments
    .filter((p) => p.status === "escrowed")
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function isPaymentReleasable(payment: Payment, jobStatus: string): boolean {
  if (payment.status !== "escrowed") return false;
  return jobStatus === "customer_confirmed" || jobStatus === "completed";
}
