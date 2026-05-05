// Handler: provider_offer_sent → reminder notification

import { getAdminClient } from "@/lib/supabase/admin";
import type { AutomationPayload, AutomationQueueItem, HandlerResult } from "@/types/automation";

export async function handleProviderOffer(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as Record<string, unknown>;
  const { job_id, provider_id, expires_at } = payload;

  if (!job_id || !provider_id) return { success: false, error: "Missing job_id or provider_id" };

  const db = getAdminClient();

  const { data: provider } = await db
    .from("providers")
    .select("user_id, business_name")
    .eq("id", provider_id as string)
    .single();

  if (!provider) return { success: true, output: { skipped: "provider not found" } };

  // The primary notification was sent in max-dispatch.ts
  // This handler handles follow-up or push channel
  await db.from("audit_logs").insert({
    actor_type: "system",
    action: "offer_sent",
    resource: "provider_offers",
    resource_id: job_id as string,
    payload: { job_id, provider_id, expires_at },
  });

  return {
    success: true,
    output: { job_id, provider_id, offer_logged: true },
  };
}
