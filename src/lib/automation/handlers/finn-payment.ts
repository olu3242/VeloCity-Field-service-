// Handler: quote_approved / payment_captured / payment_failed → FINN financial logic

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { emitEvent } from "../emitEvent";
import { platformFeePercent } from "@/lib/utils";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  QuoteApprovedPayload,
} from "@/types/automation";

export async function handleFinnPayment(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as unknown as QuoteApprovedPayload & { reason?: string };
  const { job_id } = payload;
  const eventType = item.event_type;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();

  const { data: job } = await db
    .from("jobs")
    .select("*, quotes(*), payments(*), providers(*)")
    .eq("id", job_id)
    .single();

  if (!job) return { success: false, error: "Job not found" };

  // ── payment_failed: retry notification ───────────────────
  if (eventType === "payment_failed") {
    const attempts = (payload as unknown as Record<string, unknown>).attempt as number ?? 1;

    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "payment_failed",
      title: "Payment Failed",
      body: `We were unable to process your payment. Please update your payment method. (Attempt ${attempts}/3)`,
      channel: "in_app",
      metadata: { job_id, attempts },
    });

    if (attempts >= 3) {
      await db.from("jobs").update({ status: "cancelled" }).eq("id", job_id);
      await db.from("notifications").insert({
        user_id: job.customer_id,
        type: "system_alert",
        title: "Job Cancelled",
        body: "Your job has been cancelled due to payment failure. Please rebook with an updated payment method.",
        channel: "in_app",
        metadata: { job_id },
      });
    }

    return { success: true, output: { job_id, event: "payment_failed", attempts } };
  }

  // ── quote_approved: create payment intent record ──────────
  if (eventType === "quote_approved") {
    const approvedQuote = job.quotes?.find((q: Record<string, unknown>) => q.status === "approved");
    if (!approvedQuote) return { success: true, output: { job_id, skipped: "no approved quote" } };

    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "payment_required",
      title: "Payment Required",
      body: `Your quote has been approved. Please complete payment of $${((approvedQuote.total_cents as number) / 100).toFixed(2)} to begin work.`,
      channel: "in_app",
      metadata: { job_id, quote_id: approvedQuote.id, total_cents: approvedQuote.total_cents },
    });

    return { success: true, output: { job_id, event: "quote_approved", notified: true } };
  }

  // ── payment_captured: run FINN + queue payout ─────────────
  if (eventType === "payment_captured") {
    const capturedPayments = job.payments?.filter(
      (p: Record<string, unknown>) => p.status === "captured" || p.status === "escrowed"
    ) ?? [];

    const totalCaptured = capturedPayments.reduce(
      (sum: number, p: Record<string, unknown>) => sum + (p.amount_cents as number ?? 0),
      0
    );

    const finnResult = await runAgent("FINN", {
      job: { id: job_id, status: job.status, urgency: job.urgency },
      payments: capturedPayments,
      providerCompletedJobs: 5, // fallback; would normally query
      hasActiveDispute: false,
      jobId: job_id,
    });

    const finnData = finnResult.data as {
      should_release?: boolean;
      payout_amount_cents?: number;
      platform_fee_cents?: number;
      hold_reason?: string;
      hold_until?: string;
    } | null;

    const platformFeeCents   = Math.round(totalCaptured * platformFeePercent(totalCaptured));
    const providerPayoutCents = totalCaptured - platformFeeCents;
    const releaseAfterHours = job.urgency === "emergency" ? 24 : 48;
    const releaseAfter = new Date(Date.now() + releaseAfterHours * 3_600_000).toISOString();

    // Insert into payout_queue
    const { data: payoutItem } = await db
      .from("payout_queue")
      .insert({
        job_id,
        provider_id: job.provider_id,
        amount_cents: totalCaptured,
        platform_fee_cents: finnData?.platform_fee_cents ?? platformFeeCents,
        net_payout_cents: finnData?.payout_amount_cents ?? providerPayoutCents,
        status: finnData?.hold_reason ? "held" : "queued",
        hold_reason: finnData?.hold_reason ?? null,
        release_after: finnData?.hold_until ?? releaseAfter,
      })
      .select("id")
      .single();

    await emitEvent(
      "payout_queued",
      {
        job_id,
        provider_id: job.provider_id,
        amount_cents: totalCaptured,
        platform_fee_cents: finnData?.platform_fee_cents ?? platformFeeCents,
        net_payout_cents: finnData?.payout_amount_cents ?? providerPayoutCents,
        release_after: finnData?.hold_until ?? releaseAfter,
      },
      `payout_queued:${job_id}`
    );

    return {
      success: true,
      output: {
        job_id,
        payout_queue_id: payoutItem?.id,
        net_payout_cents: finnData?.payout_amount_cents ?? providerPayoutCents,
        release_after: releaseAfter,
        finn_held: !!finnData?.hold_reason,
      },
    };
  }

  return { success: true, output: { job_id, event: eventType, noop: true } };
}
