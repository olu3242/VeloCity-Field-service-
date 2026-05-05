// Handler: tip_submitted → notify provider + agent hooks (LENA, REX, FINN, GABRIEL)

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  TipSubmittedPayload,
} from "@/types/automation";

export async function handleTipSubmitted(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as TipSubmittedPayload;
  const { tip_id, job_id, provider_id, customer_id, amount_cents, note } = payload;

  if (!tip_id || !job_id || !provider_id) {
    return { success: false, error: "Missing tip_id, job_id, or provider_id" };
  }

  const db = getAdminClient();
  const amountFormatted = `$${(amount_cents / 100).toFixed(2)}`;

  // ── 1. Notify provider ───────────────────────────────────
  const { data: provider } = await db
    .from("providers")
    .select("user_id, business_name, trust_score, completed_jobs")
    .eq("id", provider_id)
    .single();

  if (provider?.user_id) {
    await db.from("notifications").insert({
      user_id:  provider.user_id,
      type:     "tip_received",
      title:    `You received a ${amountFormatted} tip! 🎉`,
      body:     note
        ? `Your customer left a tip with a note: "${note}"`
        : `Great work! A customer tipped you ${amountFormatted} for a job well done.`,
      channel:  "in_app",
      metadata: { job_id, tip_id, amount_cents },
    });
  }

  // ── 2. GABRIEL — governance audit log ────────────────────
  await runAgent("GABRIEL", {
    action:  "tip_received",
    payload: { tip_id, job_id, provider_id, customer_id, amount_cents },
    jobId:   job_id,
  });

  await db.from("audit_logs").insert({
    actor_type:  "system",
    actor_id:    "automation",
    action:      "tip_submitted",
    resource:    "provider_tips",
    resource_id: tip_id,
    payload:     { job_id, provider_id, customer_id, amount_cents, note },
  });

  // ── 3. REX — tip is a positive trust signal ──────────────
  const rexResult = await runAgent("REX", {
    job:        { id: job_id, status: "completed" },
    providerId: provider_id,
    customerId: customer_id,
    context:    "tip_received",
    jobId:      job_id,
  });

  const rexData = rexResult.data as { new_trust_score?: number } | null;
  if (rexData?.new_trust_score && provider) {
    const currentScore = provider.trust_score ?? 0;
    // Tips give a small trust bump (up to 1 point)
    const bumpedScore = Math.min(100, Math.round(currentScore + 0.5));
    await db.from("providers").update({ trust_score: bumpedScore }).eq("id", provider_id);
  }

  // ── 4. FINN — include tip in earnings reconciliation ─────
  await runAgent("FINN", {
    job:      { id: job_id, status: "completed" },
    payments: [{ type: "tip", amount_cents, status: "captured" }],
    providerCompletedJobs: provider?.completed_jobs ?? 0,
    hasActiveDispute: false,
    jobId: job_id,
  });

  // ── 5. LENA — follow-up engagement trigger ───────────────
  const lenaResult = await runAgent("LENA", {
    customerId: customer_id,
    jobId:      job_id,
    trigger:    "tip_submitted",
  });

  const lenaData = lenaResult.data as {
    should_send_campaign?: boolean;
    message?: string;
  } | null;

  // Send review nudge if customer hasn't reviewed yet
  const { data: existingReview } = await db
    .from("reviews")
    .select("id")
    .eq("job_id", job_id)
    .eq("customer_id", customer_id)
    .maybeSingle();

  if (!existingReview) {
    await db.from("notifications").insert({
      user_id:  customer_id,
      type:     "review_request",
      title:    "One more thing…",
      body:     "You tipped — now leave a review! It helps other customers find great providers.",
      channel:  "in_app",
      metadata: { job_id, tip_id, trigger: "post_tip" },
    });
  }

  // Optional LENA campaign
  if (lenaData?.should_send_campaign && lenaData.message) {
    await db.from("notifications").insert({
      user_id:  customer_id,
      type:     "retention",
      title:    "Thanks for being awesome!",
      body:     lenaData.message,
      channel:  "in_app",
      metadata: { job_id, tip_id, trigger: "lena_post_tip" },
    });
  }

  return {
    success: true,
    output: {
      tip_id,
      provider_notified:  !!provider?.user_id,
      trust_bumped:       !!rexData?.new_trust_score,
      review_nudge_sent:  !existingReview,
      lena_campaign_sent: !!(lenaData?.should_send_campaign && lenaData.message),
      audit_logged:       true,
    },
  };
}
