// Handler: job_accepted / job_state_changed → NOVA validates transitions + notifications

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { emitEvent } from "../emitEvent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  JobAcceptedPayload,
  JobStateChangedPayload,
} from "@/types/automation";

export async function handleNovaWorkflow(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as JobAcceptedPayload | JobStateChangedPayload;
  const job_id = (payload as JobAcceptedPayload).job_id;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();

  const { data: job } = await db
    .from("jobs")
    .select("*, providers(*), profiles!jobs_customer_id_fkey(full_name, phone)")
    .eq("id", job_id)
    .single();

  if (!job) return { success: false, error: "Job not found" };

  // ── Run NOVA ─────────────────────────────────────────────
  const novaResult = await runAgent("NOVA", {
    job: { id: job_id, status: job.status, urgency: job.urgency, category: job.category },
    transition: "job_accepted" in payload
      ? { to: "accepted" }
      : { from: (payload as JobStateChangedPayload).from_status, to: (payload as JobStateChangedPayload).to_status },
    jobId: job_id,
  });

  const novaData = novaResult.data as {
    should_notify_customer?: boolean;
    customer_message?: string;
    should_notify_provider?: boolean;
    provider_message?: string;
    next_action?: string;
    sla_deadline?: string;
  } | null;

  // ── Notify customer ──────────────────────────────────────
  const toStatus = "to_status" in payload ? payload.to_status : "accepted";

  const customerMessages: Record<string, string> = {
    accepted:    "Great news! A provider has accepted your job request.",
    en_route:    "Your provider is on the way! Track their arrival in the app.",
    arrived:     "Your provider has arrived. They'll begin work shortly.",
    in_progress: "Work has started on your job.",
    completed_pending_confirmation: "Your job is complete! Please confirm completion to release payment.",
  };

  const customerMsg = novaData?.customer_message ?? customerMessages[toStatus] ?? null;

  if (customerMsg && job.customer_id) {
    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "job_status_update",
      title: "Job Update",
      body: customerMsg,
      channel: "in_app",
      metadata: { job_id, status: toStatus },
    });
  }

  // ── Notify provider ──────────────────────────────────────
  if (job.providers?.user_id && novaData?.provider_message) {
    await db.from("notifications").insert({
      user_id: job.providers.user_id,
      type: "job_status_update",
      title: "Job Update",
      body: novaData.provider_message,
      channel: "in_app",
      metadata: { job_id, status: toStatus },
    });
  }

  // ── Start SLA timer for accepted jobs ────────────────────
  if (toStatus === "accepted" || toStatus === "offer_sent") {
    await emitEvent(
      "job_state_changed",
      { job_id, from_status: job.status, to_status: toStatus, actor_role: "system" },
      `sla_start:${job_id}:${toStatus}`
    );
  }

  return {
    success: true,
    output: { job_id, status: toStatus, nova_output: novaData, notified: !!customerMsg },
  };
}
