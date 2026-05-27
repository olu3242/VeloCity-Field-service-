import type { SupabaseClient } from "@supabase/supabase-js";

export async function getJobPhotos(supabase: SupabaseClient, tenantId: string, jobId: string) {
  const { data } = await supabase
    .from("job_photos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
