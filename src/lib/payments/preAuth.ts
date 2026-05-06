import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasPaymentCommitment(input: { supabase: SupabaseClient; tenantId: string; jobId: string; urgency?: string | null }) {
  const { data } = await input.supabase
    .from("payments")
    .select("id,status,amount_cents,type")
    .eq("tenant_id", input.tenantId)
    .eq("job_id", input.jobId)
    .in("status", ["pending", "authorized", "captured", "escrowed"])
    .limit(10);
  const committed = Boolean(data?.length);
  const emergencyRequiresFull = input.urgency === "emergency";
  return {
    allowed: committed,
    committed,
    emergencyRequiresFull,
    reason: committed ? "Payment authorization/deposit found." : "Dispatch blocked until deposit or payment authorization exists.",
    payments: data ?? [],
  };
}
