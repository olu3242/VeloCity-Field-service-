// Handler: retention_campaign / provider_scoring → LENA rebooking + retention

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
} from "@/types/automation";

export async function handleLenaRetention(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as Record<string, unknown>;
  const { job_id, customer_id, trigger } = payload;

  const db = getAdminClient();

  if (item.event_type === "provider_scoring") {
    // Score all active providers
    const { data: providers } = await db
      .from("providers")
      .select("id, trust_score, user_id, business_name, categories")
      .eq("status", "approved")
      .limit(50);

    let scored = 0;
    for (const provider of providers ?? []) {
      const { data: completedJobs } = await db
        .from("jobs")
        .select("id")
        .eq("provider_id", provider.id)
        .eq("status", "completed");

      const { data: reviews } = await db
        .from("reviews")
        .select("rating")
        .eq("provider_id", provider.id);

      const avgRating = reviews?.length
        ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
        : 0;

      const completedCount = completedJobs?.length ?? 0;
      const newTrustScore = Math.min(
        100,
        Math.round((avgRating / 5) * 60 + Math.min(completedCount / 50, 1) * 40)
      );

      await db.from("providers").update({ trust_score: newTrustScore }).eq("id", provider.id);
      scored++;
    }

    return { success: true, output: { event: "provider_scoring", providers_scored: scored } };
  }

  // retention_campaign
  if (!customer_id) return { success: true, output: { skipped: "no customer_id" } };

  const lenaResult = await runAgent("LENA", {
    customerId: customer_id,
    jobId: job_id,
    trigger: trigger ?? "job_completed",
  });

  const lenaData = lenaResult.data as {
    should_send_campaign?: boolean;
    message?: string;
    offer_type?: string;
    discount_percent?: number;
  } | null;

  if (lenaData?.should_send_campaign && lenaData.message) {
    await db.from("notifications").insert({
      user_id: customer_id as string,
      type: "retention",
      title: "Thanks for choosing VeloCity!",
      body: lenaData.message,
      channel: "in_app",
      metadata: { job_id, offer_type: lenaData.offer_type, discount_percent: lenaData.discount_percent },
    });
  }

  return {
    success: true,
    output: {
      customer_id,
      campaign_sent: lenaData?.should_send_campaign ?? false,
      offer_type: lenaData?.offer_type,
    },
  };
}
