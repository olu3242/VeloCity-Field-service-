// Handler: dispute_opened / dispute_resolved → IVY analysis + payout freeze

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  DisputeOpenedPayload,
} from "@/types/automation";

export async function handleIvyDispute(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as DisputeOpenedPayload;
  const { job_id, dispute_id, customer_id, provider_id, reason } = payload;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();
  const isOpened = item.event_type === "dispute_opened";

  if (isOpened) {
    // ── Freeze payout ──────────────────────────────────────
    await db
      .from("payout_queue")
      .update({ status: "held", hold_reason: `dispute:${dispute_id}` })
      .eq("job_id", job_id)
      .eq("status", "queued");

    // ── Lock job status ────────────────────────────────────
    await db.from("jobs").update({ status: "disputed" }).eq("id", job_id);

    // ── Run IVY ───────────────────────────────────────────
    const ivyResult = await runAgent("IVY", {
      jobId: job_id,
      disputeId: dispute_id,
      reason,
      customerId: customer_id,
      providerId: provider_id,
    });

    const ivyData = ivyResult.data as {
      recommendation?: string;
      confidence?: number;
      resolution_options?: string[];
      timeline_summary?: string;
    } | null;

    // Update dispute with AI analysis
    if (dispute_id) {
      await db
        .from("disputes")
        .update({
          metadata: {
            ivy_analysis: ivyData,
            analyzed_at: new Date().toISOString(),
          },
        })
        .eq("id", dispute_id);
    }

    // Notify both parties
    if (customer_id) {
      await db.from("notifications").insert({
        user_id: customer_id,
        type: "dispute_update",
        title: "Dispute Opened",
        body: "Your dispute has been received and is under review. We'll update you within 24 hours.",
        channel: "in_app",
        metadata: { job_id, dispute_id },
      });
    }

    // Notify all admins about the new dispute
    const { data: admins } = await db
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (admins?.length) {
      await db.from("notifications").insert(
        admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          type: "dispute_update",
          title: "New Dispute Requires Review",
          body: `Dispute opened for job ${job_id}. IVY recommends: ${ivyData?.recommendation ?? "manual review"}.`,
          channel: "in_app",
          metadata: { job_id, dispute_id, ivy_recommendation: ivyData?.recommendation },
        }))
      );
    }

    return {
      success: true,
      output: {
        job_id,
        dispute_id,
        payout_frozen: true,
        ivy_recommendation: ivyData?.recommendation ?? "manual_review",
        ivy_confidence: ivyData?.confidence ?? 0,
      },
    };
  }

  // ── dispute_resolved ──────────────────────────────────────
  if (!isOpened) {
    const resolution = (payload as unknown as Record<string, unknown>).resolution as string;

    // Unfreeze payout if resolved for provider
    if (resolution === "resolved_for_provider") {
      await db
        .from("payout_queue")
        .update({ status: "queued", hold_reason: null })
        .eq("job_id", job_id)
        .eq("status", "held");
    }

    await db.from("jobs").update({ status: "completed" }).eq("id", job_id);

    if (customer_id) {
      await db.from("notifications").insert({
        user_id: customer_id,
        type: "dispute_update",
        title: "Dispute Resolved",
        body: `Your dispute has been resolved: ${resolution?.replace(/_/g, " ")}.`,
        channel: "in_app",
        metadata: { job_id, dispute_id, resolution },
      });
    }

    return { success: true, output: { job_id, dispute_id, resolution, payout_released: resolution === "resolved_for_provider" } };
  }

  return { success: true, output: { job_id, noop: true } };
}
