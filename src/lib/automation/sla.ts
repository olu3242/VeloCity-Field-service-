// VeloCity SLA Monitor — detects breaches, stuck jobs, late providers

import { getAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "./emitEvent";

// SLA thresholds per job status (minutes)
const SLA_THRESHOLDS: Record<string, { warn: number; breach: number; escalate: number }> = {
  offer_sent:                      { warn: 8,   breach: 15,  escalate: 30  },
  accepted:                        { warn: 30,  breach: 60,  escalate: 120 },
  quote_submitted:                 { warn: 15,  breach: 30,  escalate: 60  },
  awaiting_quote_approval:         { warn: 60,  breach: 120, escalate: 240 },
  in_progress:                     { warn: 120, breach: 240, escalate: 480 },
  completed_pending_confirmation:  { warn: 60,  breach: 120, escalate: 180 },
};

export interface SLACheckResult {
  checked: number;
  warned: number;
  breached: number;
  escalated: number;
  stuck: number;
}

export async function runSLACheck(): Promise<SLACheckResult> {
  const db = getAdminClient();
  const result: SLACheckResult = { checked: 0, warned: 0, breached: 0, escalated: 0, stuck: 0 };
  const now = new Date();

  // ── Fetch active jobs ────────────────────────────────────
  const watchedStatuses = Object.keys(SLA_THRESHOLDS);

  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, customer_id, provider_id, urgency, updated_at")
    .in("status", watchedStatuses)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (!jobs) return result;

  for (const job of jobs) {
    result.checked++;

    const threshold = SLA_THRESHOLDS[job.status];
    if (!threshold) continue;

    const lastUpdateMs = now.getTime() - new Date(job.updated_at).getTime();
    const minutesElapsed = Math.floor(lastUpdateMs / 60_000);

    // Emergency jobs: halve all thresholds
    const multiplier = job.urgency === "emergency" ? 0.5 : 1;
    const warnAt    = threshold.warn     * multiplier;
    const breachAt  = threshold.breach   * multiplier;
    const escalateAt= threshold.escalate * multiplier;

    if (minutesElapsed >= escalateAt) {
      await emitEvent(
        "sla_escalate",
        { job_id: job.id, status: job.status, minutes_elapsed: minutesElapsed, threshold_minutes: escalateAt },
        `sla_escalate:${job.id}:${Math.floor(minutesElapsed / 10)}` // dedup per 10-min window
      );
      result.escalated++;
    } else if (minutesElapsed >= breachAt) {
      await emitEvent(
        "sla_breach",
        { job_id: job.id, status: job.status, minutes_elapsed: minutesElapsed, threshold_minutes: breachAt },
        `sla_breach:${job.id}:${Math.floor(minutesElapsed / 5)}`
      );
      result.breached++;
    } else if (minutesElapsed >= warnAt) {
      await emitEvent(
        "sla_warn",
        { job_id: job.id, status: job.status, minutes_elapsed: minutesElapsed, threshold_minutes: warnAt },
        `sla_warn:${job.id}:${Math.floor(minutesElapsed / 5)}`
      );
      result.warned++;
    }
  }

  return result;
}

export async function detectStuckJobs(): Promise<number> {
  const db = getAdminClient();
  const stuckThresholdMs = 4 * 60 * 60_000; // 4 hours
  const cutoff = new Date(Date.now() - stuckThresholdMs).toISOString();

  const { data: stuckJobs } = await db
    .from("jobs")
    .select("id, status, updated_at")
    .in("status", ["en_route", "arrived", "diagnosis_in_progress", "in_progress"])
    .lt("updated_at", cutoff)
    .limit(50);

  if (!stuckJobs?.length) return 0;

  for (const job of stuckJobs) {
    const minutesStuck = Math.floor((Date.now() - new Date(job.updated_at).getTime()) / 60_000);

    await emitEvent(
      "job_stuck",
      { job_id: job.id, status: job.status, minutes_elapsed: minutesStuck, threshold_minutes: 240 },
      `stuck:${job.id}:${Math.floor(minutesStuck / 60)}`
    );
  }

  return stuckJobs.length;
}

export async function detectExpiredOffers(): Promise<number> {
  const db = getAdminClient();

  // Expire old pending offers
  const { data: expiredOffers } = await db
    .from("provider_offers")
    .select("job_id, provider_id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .limit(100);

  if (!expiredOffers?.length) return 0;

  const jobIds = Array.from(new Set(expiredOffers.map((o) => o.job_id)));

  // Mark offers expired
  await db
    .from("provider_offers")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  // Check which jobs now have NO pending offers
  for (const jobId of jobIds) {
    const { data: remainingOffers } = await db
      .from("provider_offers")
      .select("id")
      .eq("job_id", jobId)
      .eq("status", "pending");

    if (!remainingOffers?.length) {
      const attempt = 1; // track via audit_logs in production
      await emitEvent(
        "no_provider_accepted",
        { job_id: jobId, attempt },
        `no_provider:${jobId}:expired`
      );
    }
  }

  return expiredOffers.length;
}

export async function processReadyPayouts(): Promise<number> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  const { data: readyPayouts } = await db
    .from("payout_queue")
    .select("id, job_id, provider_id, net_payout_cents")
    .eq("status", "queued")
    .lte("release_after", now)
    .limit(20);

  if (!readyPayouts?.length) return 0;

  for (const payout of readyPayouts) {
    await emitEvent(
      "payout_released",
      {
        job_id: payout.job_id,
        provider_id: payout.provider_id,
        net_payout_cents: payout.net_payout_cents,
      },
      `payout_release:${payout.id}`
    );
  }

  return readyPayouts.length;
}
