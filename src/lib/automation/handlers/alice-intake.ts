// Handler: service_request_created → ALICE classifies → emit serviceability result

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { emitEvent } from "../emitEvent";
import type { AutomationPayload, AutomationQueueItem, HandlerResult, ServiceRequestCreatedPayload } from "@/types/automation";

export async function handleAliceIntake(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as ServiceRequestCreatedPayload;
  const { job_id, customer_id, category, urgency, zip, title, description } = payload;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();

  // ── Run ALICE ────────────────────────────────────────────
  const result = await runAgent("ALICE", {
    message: `${title}: ${description}`,
    zip,
    jobId: job_id,
    userId: customer_id,
  });

  const classification = result.data as Record<string, unknown> | null;
  const isServiceable = classification?.is_serviceable !== false; // default true on AI failure

  // ── Update job with classification ───────────────────────
  await db
    .from("jobs")
    .update({
      ai_classification: classification ?? { fallback: true, category, urgency },
      status: isServiceable ? "awaiting_match" : "cancelled",
    })
    .eq("id", job_id);

  // ── Emit next event ──────────────────────────────────────
  if (isServiceable) {
    await emitEvent(
      "serviceability_passed",
      {
        job_id,
        category: (classification?.category as string) ?? category,
        urgency: (classification?.urgency as string) ?? urgency,
        zip,
        city:  (classification?.city  as string) ?? "",
        state: (classification?.state as string) ?? "",
        ai_classification: classification ?? {},
      },
      `serviceability_passed:${job_id}`
    );
  } else {
    await emitEvent(
      "serviceability_failed",
      { job_id, reason: (classification?.serviceability_reason as string) ?? "Not serviceable" },
      `serviceability_failed:${job_id}`
    );

    // Notify customer
    await db.from("notifications").insert({
      user_id: customer_id,
      type: "system_alert",
      title: "Request Not Serviceable",
      body: (classification?.customer_message as string) ?? "We're unable to service this request at this time.",
      channel: "in_app",
    });
  }

  return {
    success: true,
    output: { job_id, is_serviceable: isServiceable, classification },
  };
}
