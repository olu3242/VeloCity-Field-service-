import type { SupabaseClient } from "@supabase/supabase-js";

export async function sendMessage(input: {
  supabase: SupabaseClient;
  tenantId: string;
  jobId: string;
  senderId: string;
  senderRole: "customer" | "provider" | "admin";
  message: string;
  attachments?: unknown[];
}) {
  return input.supabase.from("job_messages").insert({
    tenant_id: input.tenantId,
    job_id: input.jobId,
    sender_id: input.senderId,
    sender_role: input.senderRole,
    message: input.message,
    attachments: input.attachments ?? [],
  }).select().single();
}
