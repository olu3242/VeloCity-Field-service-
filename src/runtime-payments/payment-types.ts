export interface Payment {
  id: string;
  jobId: string;
  tenantId: string;
  amountCents: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  status: "pending" | "authorized" | "captured" | "escrowed" | "released" | "refunded" | "failed";
  stripePaymentIntentId?: string;
  createdAt: string;
}

export interface PayoutRecord {
  id: string;
  providerId: string;
  paymentId: string;
  amountCents: number;
  status: "pending" | "processing" | "succeeded" | "failed";
  stripeTransferId?: string;
  scheduledAt: string;
  processedAt?: string;
}

export interface RefundRecord {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  status: "pending" | "processed" | "failed";
  stripeRefundId?: string;
}
