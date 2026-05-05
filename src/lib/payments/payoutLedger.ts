import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentActionResult, PaymentContext } from "./types";

export async function writePayoutLedger(supabase: SupabaseClient, input: PaymentContext, result: PaymentActionResult) {
  return supabase.from("payout_ledger").insert({
    tenant_id: input.tenantId,
    job_id: input.jobId ?? null,
    customer_id: input.customerId ?? null,
    provider_id: input.providerId ?? null,
    payment_id: input.paymentId ?? null,
    amount: result.providerPayoutCents,
    currency: input.currency ?? "usd",
    status: result.status,
    metadata: { ...result.metadata, message: result.message, risk_flags: result.riskFlags },
  });
}
