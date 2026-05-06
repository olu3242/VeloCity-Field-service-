import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMessages(supabase: SupabaseClient, tenantId: string, jobId: string) {
  const { data } = await supabase
    .from("job_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
