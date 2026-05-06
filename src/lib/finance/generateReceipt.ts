import type { SupabaseClient } from "@supabase/supabase-js";

export async function generateReceipt(input: {
  supabase: SupabaseClient;
  tenantId: string;
  jobId: string;
  customerId: string;
  providerId?: string | null;
  amount: number;
  breakdown: Record<string, unknown>;
}) {
  return input.supabase.from("receipts").insert({
    tenant_id: input.tenantId,
    job_id: input.jobId,
    customer_id: input.customerId,
    provider_id: input.providerId ?? null,
    amount: input.amount,
    breakdown: input.breakdown,
  }).select().single();
}
