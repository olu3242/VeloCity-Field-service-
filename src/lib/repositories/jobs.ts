import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAccessibleJob(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    jobId: string;
    userId: string;
    role?: string | null;
  }
) {
  let query = supabase
    .from("jobs")
    .select("id, customer_id, provider_id, tenant_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.jobId);

  if (input.role === "customer") {
    query = query.eq("customer_id", input.userId);
  }

  if (input.role === "provider") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .single();
    query = query.eq("provider_id", provider?.id ?? "");
  }

  return query.single();
}

export async function getJobWithRuntime(supabase: SupabaseClient, jobId: string) {
  return supabase
    .from("jobs")
    .select(`
      *,
      profiles!jobs_customer_id_fkey(id, full_name, phone, avatar_url),
      providers(id, business_name, trust_score, profiles!providers_user_id_fkey(full_name, phone, avatar_url)),
      quotes(*),
      payments(*)
    `)
    .eq("id", jobId)
    .single();
}
