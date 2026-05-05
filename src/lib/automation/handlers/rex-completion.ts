// Handler: job_completed / customer_confirmed → REX trust update + LENA retention + payout trigger

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { emitEvent } from "../emitEvent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  JobCompletedPayload,
} from "@/types/automation";

export async function handleRexCompletion(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as JobCompletedPayload;
  const { job_id, provider_id, customer_id } = payload;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();
  const isConfirmed = item.event_type === "customer_confirmed";

  // ── Run REX — update trust score ─────────────────────────
  const rexResult = await runAgent("REX", {
    job: { id: job_id, status: isConfirmed ? "customer_confirmed" : "completed" },
    providerId: provider_id,
    customerId: customer_id,
    jobId: job_id,
  });

  const rexData = rexResult.data as {
    new_trust_score?: number;
    trust_delta?: number;
    badges_earned?: string[];
  } | null;

  // Update provider trust score
  if (rexData?.new_trust_score !== undefined && provider_id) {
    await db
      .from("providers")
      .update({ trust_score: rexData.new_trust_score })
      .eq("id", provider_id);
  }

  // ── Request review from customer ─────────────────────────
  if (customer_id) {
    await db.from("notifications").insert({
      user_id: customer_id,
      type: "review_request",
      title: "How did it go?",
      body: "Your service is complete! Please take a moment to rate your provider.",
      channel: "in_app",
      metadata: { job_id, provider_id },
    });
  }

  // ── Trigger LENA retention ────────────────────────────────
  await emitEvent(
    "retention_campaign",
    { job_id, customer_id, provider_id, trigger: "job_completed" },
    `retention:${job_id}`
  );

  // ── Trigger payout on customer_confirmed ─────────────────
  if (isConfirmed && provider_id) {
    const { data: payments } = await db
      .from("payments")
      .select("*")
      .eq("job_id", job_id)
      .in("status", ["captured", "escrowed"]);

    const totalCaptured = payments?.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) ?? 0;

    if (totalCaptured > 0) {
      await emitEvent(
        "payment_captured",
        { job_id, provider_id, customer_id, total_cents: totalCaptured },
        `payment_captured_confirmed:${job_id}`
      );
    }
  }

  // ── Mark job closed ──────────────────────────────────────
  if (isConfirmed) {
    await db.from("jobs").update({ status: "completed" }).eq("id", job_id);
  }

  return {
    success: true,
    output: {
      job_id,
      trust_updated: !!rexData?.new_trust_score,
      new_trust_score: rexData?.new_trust_score,
      review_requested: true,
      retention_queued: true,
    },
  };
}
