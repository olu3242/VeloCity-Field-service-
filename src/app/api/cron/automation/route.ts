import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/automation/emitEvent";
import { processAutomationQueue } from "@/lib/automation/worker";

const ACTIVE_STATUSES = ["submitted", "awaiting_match", "offer_sent", "accepted", "scheduled", "en_route", "arrived", "diagnosis_in_progress", "in_progress"];

export async function GET(request: NextRequest) {
  return runAutomationCron(request);
}

export async function POST(request: NextRequest) {
  return runAutomationCron(request);
}

async function runAutomationCron(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const supabase = await createAdminClient();
  const now = new Date();
  const bucket = now.toISOString().slice(0, 16);
  const emitted: string[] = [];

  const { data: expiredOffers } = await supabase
    .from("provider_offers")
    .select("id,job_id,provider_id,expires_at")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .lt("expires_at", now.toISOString())
    .limit(25);

  for (const offer of expiredOffers ?? []) {
    await supabase.from("provider_offers").update({
      rejected_at: now.toISOString(),
      rejection_reason: "Offer expired by automation",
    }).eq("id", offer.id);
    await emitEvent(supabase, {
      type: "provider_offer_expired",
      source: "cron.automation",
      entityType: "provider_offer",
      entityId: offer.id,
      dedupKey: `provider_offer_expired:${offer.id}`,
      payload: { job_id: offer.job_id, provider_id: offer.provider_id, offer_id: offer.id },
    });
    emitted.push("provider_offer_expired");
  }

  const oneHourAgo = new Date(now.getTime() - 60 * 60_000).toISOString();
  const { data: slaJobs } = await supabase
    .from("jobs")
    .select("id,status,urgency,category,customer_id,provider_id,created_at,title")
    .in("status", ACTIVE_STATUSES)
    .eq("urgency", "emergency")
    .lt("created_at", oneHourAgo)
    .limit(25);

  for (const job of slaJobs ?? []) {
    await emitEvent(supabase, {
      type: "sla_breach_detected",
      source: "cron.automation",
      entityType: "job",
      entityId: job.id,
      dedupKey: `sla_breach_detected:${job.id}:${bucket}`,
      payload: { job_id: job.id, status: job.status, urgency: job.urgency, category: job.category, customer_id: job.customer_id, provider_id: job.provider_id, title: job.title },
    });
    emitted.push("sla_breach_detected");
  }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { data: stuckJobs } = await supabase
    .from("jobs")
    .select("id,status,urgency,category,customer_id,provider_id,updated_at,title")
    .in("status", ACTIVE_STATUSES)
    .lt("updated_at", dayAgo)
    .limit(25);

  for (const job of stuckJobs ?? []) {
    await emitEvent(supabase, {
      type: "stuck_job_detected",
      source: "cron.automation",
      entityType: "job",
      entityId: job.id,
      dedupKey: `stuck_job_detected:${job.id}:${bucket}`,
      payload: { job_id: job.id, status: job.status, urgency: job.urgency, category: job.category, customer_id: job.customer_id, provider_id: job.provider_id, title: job.title },
    });
    emitted.push("stuck_job_detected");
  }

  const { data: failedPayments } = await supabase
    .from("payments")
    .select("id,job_id,customer_id,amount_cents,status,type")
    .eq("status", "failed")
    .limit(25);

  for (const payment of failedPayments ?? []) {
    await emitEvent(supabase, {
      type: "failed_payment_retry",
      source: "cron.automation",
      entityType: "payment",
      entityId: payment.id,
      dedupKey: `failed_payment_retry:${payment.id}:${bucket}`,
      payload: { payment_id: payment.id, job_id: payment.job_id, customer_id: payment.customer_id, amount_cents: payment.amount_cents, payment_type: payment.type },
    });
    emitted.push("failed_payment_retry");
  }

  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000).toISOString();
  const { data: unsentNotifications } = await supabase
    .from("notifications")
    .select("id,user_id,channel,title,created_at")
    .is("sent_at", null)
    .lt("created_at", fifteenMinutesAgo)
    .limit(25);

  for (const notification of unsentNotifications ?? []) {
    await emitEvent(supabase, {
      type: "failed_notification_retry",
      source: "cron.automation",
      entityType: "notification",
      entityId: notification.id,
      dedupKey: `failed_notification_retry:${notification.id}:${bucket}`,
      payload: { notification_id: notification.id, user_id: notification.user_id, channel: notification.channel, title: notification.title },
    });
    emitted.push("failed_notification_retry");
  }

  const { data: payoutPayments } = await supabase
    .from("payments")
    .select("id,job_id,provider_id,amount_cents,status")
    .in("status", ["captured", "escrowed"])
    .limit(25);

  for (const payment of payoutPayments ?? []) {
    await emitEvent(supabase, {
      type: "payout_queued",
      source: "cron.automation",
      entityType: "payment",
      entityId: payment.id,
      dedupKey: `payout_queued:${payment.id}:${bucket}`,
      payload: { payment_id: payment.id, job_id: payment.job_id, provider_id: payment.provider_id, amount_cents: payment.amount_cents },
    });
    emitted.push("payout_queued");
  }

  const processed = await processAutomationQueue(supabase, 50);

  return NextResponse.json({
    emitted,
    emitted_count: emitted.length,
    processed,
  });
}
