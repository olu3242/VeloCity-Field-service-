import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessibleJob } from "@/lib/repositories/jobs";

export async function assertJobAccess(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    jobId: string;
    userId: string;
    role?: string | null;
  }
) {
  const { data, error } = await getAccessibleJob(supabase, input);
  if (error || !data) return false;
  return true;
}
