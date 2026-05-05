// Handler: sla_warn / sla_breach / sla_escalate / no_provider_accepted / job_stuck / provider_late

import { getAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "../emitEvent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  SLAPayload,
} from "@/types/automation";

const MAX_DISPATCH_ATTEMPTS = 3;

export async function handleSLACheck(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as SLAPayload & Record<string, unknown>;
  const { job_id } = payload;
  const eventType = item.event_type;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", job_id).single();
  if (!job) return { success: false, error: "Job not found" };

  // ── SLA Warn ─────────────────────────────────────────────
  if (eventType === "sla_warn") {
    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "system_alert",
      title: "We're working on it",
      body: "We're still finding the best provider for your request. Thank you for your patience.",
      channel: "in_app",
      metadata: { job_id, sla_type: "warn" },
    });

    return { success: true, output: { job_id, action: "customer_notified_warn" } };
  }

  // ── SLA Breach: reassign ──────────────────────────────────
  if (eventType === "sla_breach") {
    const attempt = (payload.attempt as number) ?? 1;

    // Expire current offers
    await db
      .from("provider_offers")
      .update({ status: "expired" })
      .eq("job_id", job_id)
      .eq("status", "pending");

    if (attempt < MAX_DISPATCH_ATTEMPTS) {
      // Retrigger dispatch with broadened search
      await emitEvent(
        "serviceability_passed",
        {
          job_id,
          category: job.category,
          urgency: job.urgency,
          zip: job.zip,
          city: job.city,
          state: job.state,
          attempt: attempt + 1,
        } as AutomationPayload,
        `redispatch:${job_id}:${attempt + 1}`
      );

      await db.from("notifications").insert({
        user_id: job.customer_id,
        type: "system_alert",
        title: "Still searching for your provider",
        body: "We're expanding our search to find you a provider. We'll notify you as soon as someone accepts.",
        channel: "in_app",
        metadata: { job_id, attempt: attempt + 1 },
      });
    } else {
      // Escalate to admin after 3 failed attempts
      await emitEvent(
        "sla_escalate",
        { job_id, reason: "no_provider_after_3_attempts", attempt } as AutomationPayload,
        `sla_escalate:${job_id}`
      );
    }

    return { success: true, output: { job_id, action: "redispatched", attempt } };
  }

  // ── SLA Escalate: admin alert ─────────────────────────────
  if (eventType === "sla_escalate" || eventType === "no_provider_accepted") {
    // Flag job for manual admin intervention
    await db.from("jobs").update({ status: "awaiting_match" }).eq("id", job_id);

    await db.from("audit_logs").insert({
      actor_type: "system",
      action: "sla_escalation",
      resource: "jobs",
      resource_id: job_id,
      payload: { reason: payload.reason ?? "sla_escalate", job_status: job.status },
    });

    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "system_alert",
      title: "Request Escalated to Support",
      body: "Our team is personally handling your request. A support specialist will reach out within 30 minutes.",
      channel: "in_app",
      metadata: { job_id, escalated: true },
    });

    return { success: true, output: { job_id, action: "escalated_to_admin" } };
  }

  // ── Job Stuck ─────────────────────────────────────────────
  if (eventType === "job_stuck") {
    const minutesStuck = payload.minutes_elapsed as number ?? 0;

    await db.from("audit_logs").insert({
      actor_type: "system",
      action: "job_stuck_detected",
      resource: "jobs",
      resource_id: job_id,
      payload: { status: job.status, minutes_stuck: minutesStuck },
    });

    // Notify provider if job has one
    if (job.provider_id) {
      const { data: provider } = await db
        .from("providers")
        .select("user_id")
        .eq("id", job.provider_id)
        .single();

      if (provider) {
        await db.from("notifications").insert({
          user_id: provider.user_id,
          type: "system_alert",
          title: "Action Required",
          body: `Your job has been in "${job.status}" status for over ${Math.round(minutesStuck / 60)} hour(s). Please update the job status.`,
          channel: "in_app",
          metadata: { job_id, status: job.status },
        });
      }
    }

    return { success: true, output: { job_id, action: "stuck_job_alerted", minutes_stuck: minutesStuck } };
  }

  // ── Provider Late ─────────────────────────────────────────
  if (eventType === "provider_late") {
    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "system_alert",
      title: "Provider Running Late",
      body: "Your provider is running a bit late. We've notified them to update their ETA.",
      channel: "in_app",
      metadata: { job_id },
    });

    if (job.provider_id) {
      const { data: provider } = await db
        .from("providers")
        .select("user_id")
        .eq("id", job.provider_id)
        .single();

      if (provider) {
        await db.from("notifications").insert({
          user_id: provider.user_id,
          type: "system_alert",
          title: "Update Your ETA",
          body: "Your customer is waiting. Please update your arrival time or contact them directly.",
          channel: "in_app",
          metadata: { job_id },
        });

        // Flag provider for lateness pattern analysis
        await db.from("audit_logs").insert({
          actor_type: "system",
          action: "provider_late_flag",
          resource: "providers",
          resource_id: job.provider_id,
          payload: { job_id, flagged_at: new Date().toISOString() },
        });
      }
    }

    return { success: true, output: { job_id, action: "provider_late_handled" } };
  }

  return { success: true, output: { job_id, event_type: eventType, noop: true } };
}
