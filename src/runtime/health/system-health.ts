import { env, hasEnvGroup } from "@/config/env";
import { getAdminClient } from "@/lib/supabase/admin";

export type ServiceStatus = "healthy" | "degraded" | "down";

export type SystemHealth = {
  status: ServiceStatus;
  environment: "development" | "production";
  timestamp: string;
  deployment: {
    appUrl: string;
    buildTime: string | null;
  };
  services: Record<string, {
    status: ServiceStatus;
    configured: boolean;
    detail?: string;
  }>;
  queue: {
    pending: number;
    processing: number;
    completed24h: number;
    failed: number;
    deadLetters: number;
    stalePending: number;
    oldestPendingAgeMs: number | null;
  };
  workers: {
    online: number;
    stale: number;
    lastSeenAt: string | null;
  };
  payouts: {
    queued: number;
    failed: number;
    held: number;
  };
  warnings: string[];
};

function aggregateStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

function ageMs(iso?: string | null) {
  return iso ? Math.max(0, Date.now() - new Date(iso).getTime()) : null;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const warnings: string[] = [];
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const stalePendingBefore = new Date(Date.now() - 30 * 60_000).toISOString();

  const services: SystemHealth["services"] = {
    supabase: { status: env.supabase.enabled ? "healthy" : "down", configured: env.supabase.enabled },
    stripe: { status: hasEnvGroup("stripe") ? "healthy" : "degraded", configured: hasEnvGroup("stripe") },
    ai: { status: env.ai.enabled ? "healthy" : "degraded", configured: env.ai.enabled },
    cron: { status: env.cronSecret ? "healthy" : "degraded", configured: Boolean(env.cronSecret) },
    notifications: {
      status: hasEnvGroup("sms") || hasEnvGroup("email") ? "healthy" : "degraded",
      configured: hasEnvGroup("sms") || hasEnvGroup("email"),
    },
    realtime: { status: env.supabase.enabled ? "healthy" : "down", configured: env.supabase.enabled },
  };

  if (!env.supabase.enabled || !env.supabase.serviceRoleKey) {
    warnings.push("Supabase service-role runtime is not configured; DB health checks are unavailable.");
    services.supabase.status = "down";
    services.realtime.status = "down";
    return {
      status: aggregateStatus(Object.values(services).map((service) => service.status)),
      environment: env.isProduction ? "production" : "development",
      timestamp: new Date().toISOString(),
      deployment: { appUrl: env.appUrl, buildTime: null },
      services,
      queue: { pending: 0, processing: 0, completed24h: 0, failed: 0, deadLetters: 0, stalePending: 0, oldestPendingAgeMs: null },
      workers: { online: 0, stale: 0, lastSeenAt: null },
      payouts: { queued: 0, failed: 0, held: 0 },
      warnings,
    };
  }

  const db = getAdminClient();
  const [
    pending,
    processing,
    completed,
    failed,
    deadLetters,
    stalePending,
    oldestPending,
    onlineWorkers,
    staleWorkers,
    lastWorker,
    payoutsQueued,
    payoutsFailed,
    payoutsHeld,
  ] = await Promise.all([
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "processing"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "completed").gte("processed_at", since24h),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("automation_dead_letters").select("*", { count: "exact", head: true }).eq("status", "open"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "pending").lt("created_at", stalePendingBefore),
    db.from("automation_queue").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    db.from("worker_heartbeats").select("*", { count: "exact", head: true }).eq("status", "online").gte("last_seen_at", staleBefore),
    db.from("worker_heartbeats").select("*", { count: "exact", head: true }).lt("last_seen_at", staleBefore),
    db.from("worker_heartbeats").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payout_queue").select("*", { count: "exact", head: true }).eq("status", "queued"),
    db.from("payout_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("payout_queue").select("*", { count: "exact", head: true }).eq("status", "hold"),
  ]);

  if ((failed.count ?? 0) > 0) warnings.push(`${failed.count} automation queue item(s) failed.`);
  if ((deadLetters.count ?? 0) > 0) warnings.push(`${deadLetters.count} dead-letter item(s) need replay or closure.`);
  if ((staleWorkers.count ?? 0) > 0) warnings.push(`${staleWorkers.count} worker heartbeat(s) stale.`);
  if (!hasEnvGroup("stripe")) warnings.push("Stripe is degraded; payments/payouts may use fallback behavior.");
  if (!env.ai.enabled) warnings.push("AI provider is not configured; deterministic fallbacks are active.");

  if ((failed.count ?? 0) > 0 || (deadLetters.count ?? 0) > 0) services.cron.status = "degraded";
  if ((onlineWorkers.count ?? 0) === 0) services.cron.status = "degraded";

  return {
    status: aggregateStatus(Object.values(services).map((service) => service.status)),
    environment: env.isProduction ? "production" : "development",
    timestamp: new Date().toISOString(),
    deployment: { appUrl: env.appUrl, buildTime: null },
    services,
    queue: {
      pending: pending.count ?? 0,
      processing: processing.count ?? 0,
      completed24h: completed.count ?? 0,
      failed: failed.count ?? 0,
      deadLetters: deadLetters.count ?? 0,
      stalePending: stalePending.count ?? 0,
      oldestPendingAgeMs: ageMs((oldestPending.data as { created_at?: string } | null)?.created_at),
    },
    workers: {
      online: onlineWorkers.count ?? 0,
      stale: staleWorkers.count ?? 0,
      lastSeenAt: (lastWorker.data as { last_seen_at?: string } | null)?.last_seen_at ?? null,
    },
    payouts: {
      queued: payoutsQueued.count ?? 0,
      failed: payoutsFailed.count ?? 0,
      held: payoutsHeld.count ?? 0,
    },
    warnings,
  };
}
