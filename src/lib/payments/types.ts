export type PaymentAutomationState =
  | "payment_required"
  | "deposit_authorized"
  | "deposit_captured"
  | "balance_required"
  | "balance_authorized"
  | "paid"
  | "payout_pending"
  | "payout_hold"
  | "payout_released"
  | "refund_pending"
  | "refunded"
  | "payment_failed"
  | "chargeback_opened";

export interface PaymentContext {
  tenantId: string;
  jobId?: string;
  customerId?: string;
  providerId?: string;
  amountCents: number;
  currency?: string;
  paymentId?: string;
  stripePaymentIntentId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentActionResult {
  status: PaymentAutomationState;
  amountCents: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  riskFlags: string[];
  message: string;
  metadata: Record<string, unknown>;
}
