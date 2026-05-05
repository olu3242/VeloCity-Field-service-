// Handler: quote_submitted → QUINN validates pricing → notify customer

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  QuoteSubmittedPayload,
} from "@/types/automation";

export async function handleQuinnQuote(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as QuoteSubmittedPayload;
  const { job_id, quote_id, customer_id, total_cents, line_items } = payload;

  if (!job_id || !quote_id) return { success: false, error: "Missing job_id or quote_id" };

  const db = getAdminClient();

  const { data: job } = await db
    .from("jobs")
    .select("category, urgency, city, state")
    .eq("id", job_id)
    .single();

  if (!job) return { success: false, error: "Job not found" };

  // ── Run QUINN ────────────────────────────────────────────
  const quinnResult = await runAgent("QUINN", {
    lineItems:  line_items,
    category:   job.category,
    urgency:    job.urgency,
    city:       job.city,
    state:      job.state,
    totalCents: total_cents,
    jobId:      job_id,
  });

  const quinnData = quinnResult.data as {
    is_fair?: boolean;
    overcharge_detected?: boolean;
    recommendation?: string;
    customer_message?: string;
    variance_percent?: number;
    market_rate_range?: { min: number; max: number };
  } | null;

  // ── Update quote with AI analysis ────────────────────────
  await db
    .from("quotes")
    .update({
      metadata: {
        quinn_analysis: quinnData,
        reviewed_at: new Date().toISOString(),
      },
    })
    .eq("id", quote_id);

  // ── Notify customer ──────────────────────────────────────
  let notifBody = `Your provider has submitted a quote for $${(total_cents / 100).toFixed(2)}. Please review and approve.`;

  if (quinnData?.overcharge_detected) {
    notifBody = `Your provider submitted a quote that may be above market rate. Please review carefully before approving.`;
  } else if (quinnData?.customer_message) {
    notifBody = quinnData.customer_message;
  }

  await db.from("notifications").insert({
    user_id: customer_id,
    type: "quote_ready",
    title: "Quote Ready for Review",
    body: notifBody,
    channel: "in_app",
    metadata: { job_id, quote_id, total_cents, quinn_recommendation: quinnData?.recommendation },
  });

  return {
    success: true,
    output: {
      job_id,
      quote_id,
      quinn_recommendation: quinnData?.recommendation ?? "approve",
      overcharge_detected: quinnData?.overcharge_detected ?? false,
      is_fair: quinnData?.is_fair ?? true,
    },
  };
}
