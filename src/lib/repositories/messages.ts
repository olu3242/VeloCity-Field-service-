import type { SupabaseClient } from "@supabase/supabase-js";
import { getMessages } from "@/lib/messaging/getMessages";
import { sendMessage } from "@/lib/messaging/sendMessage";

export { getMessages, sendMessage };

export async function listJobMessages(supabase: SupabaseClient, tenantId: string, jobId: string) {
  return getMessages(supabase, tenantId, jobId);
}
