import type { SupabaseClient } from "@supabase/supabase-js";

export async function buildEvidenceBundle(input: { supabase: SupabaseClient; tenantId: string; jobId: string }) {
  const [job, photos, messages, checkins, quotes, payments, events] = await Promise.all([
    input.supabase.from("jobs").select("*").eq("tenant_id", input.tenantId).eq("id", input.jobId).maybeSingle(),
    input.supabase.from("job_photos").select("*").eq("tenant_id", input.tenantId).eq("job_id", input.jobId).order("created_at"),
    input.supabase.from("job_messages").select("*").eq("tenant_id", input.tenantId).eq("job_id", input.jobId).order("created_at"),
    input.supabase.from("job_checkins").select("*").eq("tenant_id", input.tenantId).eq("job_id", input.jobId).order("created_at"),
    input.supabase.from("quotes").select("*").eq("tenant_id", input.tenantId).eq("job_id", input.jobId).order("created_at"),
    input.supabase.from("payments").select("*").eq("tenant_id", input.tenantId).eq("job_id", input.jobId).order("created_at"),
    input.supabase.from("automation_events").select("*").eq("tenant_id", input.tenantId).eq("entity_id", input.jobId).order("created_at"),
  ]);
  return {
    job: job.data,
    photos: photos.data ?? [],
    messages: messages.data ?? [],
    checkins: checkins.data ?? [],
    quotes: quotes.data ?? [],
    payments: payments.data ?? [],
    timeline: events.data ?? [],
  };
}
