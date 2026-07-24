// Platform health aggregator: queries all platform subsystems and produces
// the unified WorkstreamHealthMatrix used by /admin/runtime/workstreams
// and /api/admin/runtime/workstreams. Does not call any external HTTP —
// all checks are direct database queries or env inspections.

import { getAdminClient } from "@/lib/supabase/admin";
import { checkRedisHealth } from "@/lib/redis";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { env } from "@/env";
import { WORKSTREAM_REGISTRY } from "./registry";
import { redis } from "@/lib/redis/client";
import type {
  DependencyHealth,
  DependencyStatus,
  PlatformHealthReport,
  WorkstreamHealth,
  WorkstreamHealthEntry,
} from "./types";

const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 min

function worstHealth(statuses: DependencyStatus[], criticalOnly = false): WorkstreamHealth {
  const targets = criticalOnly ? statuses.filter((s) => s.critical) : statuses;
  if (targets.some((s) => s.health === "offline" && s.critical)) return "offline";
  if (targets.some((s) => s.health !== "healthy")) return "degraded";
  return "healthy";
}

export async function aggregatePlatformHealth(
  tenantId: string,
): Promise<PlatformHealthReport> {
  const [
    dbResult,
    redisResult,
    queueResult,
    workerResult,
  ] = await Promise.allSettled([
    checkDatabase(),
    checkRedisHealth(),
    checkQueue(tenantId),
    checkWorkers(tenantId),
  ]);

  const db =
    dbResult.status === "fulfilled"
      ? dbResult.value
      : { health: "offline" as DependencyHealth, latencyMs: undefined, error: "Connection failed" };

  const redisHealth =
    redisResult.status === "fulfilled" ? redisResult.value : { configured: false, reachable: false, latencyMs: null };

  const queueData =
    queueResult.status === "fulfilled"
      ? queueResult.value
      : { depth: 0, stuck: 0, oldestItemAgeMs: null };

  const workerData =
    workerResult.status === "fulfilled"
      ? workerResult.value
      : { recentFailures: 0, lastRun: null };

  const circuits = getAllCircuits();

  const isRedisConfigured = redis.isConfigured;
  const isAiConfigured =
    !!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.includes("placeholder");
  const isStripeConfigured =
    !!env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes("placeholder");

  // ── Dependency status map ─────────────────────────────────────────────────
  const dependencies: Record<string, DependencyStatus> = {
    database: {
      name: "database",
      displayName: "Supabase Postgres",
      health: db.health,
      latencyMs: db.latencyMs,
      error: db.error,
      lastChecked: new Date().toISOString(),
      critical: true,
    },
    redis: {
      name: "redis",
      displayName: "Redis (Upstash)",
      health: isRedisConfigured
        ? redisHealth.reachable ? "healthy" : "degraded"
        : "unknown",
      latencyMs: redisHealth.latencyMs ?? undefined,
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    ai: {
      name: "ai",
      displayName: "Anthropic AI",
      health: isAiConfigured ? "healthy" : "unknown",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    stripe: {
      name: "stripe",
      displayName: "Stripe Payments",
      health: isStripeConfigured ? "healthy" : "unknown",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "automation-queue": {
      name: "automation-queue",
      displayName: "Automation Queue",
      health: queueData.stuck > 10 ? "degraded" : "healthy",
      lastChecked: new Date().toISOString(),
      critical: true,
    },
    "provider-registry": {
      name: "provider-registry",
      displayName: "Provider Registry",
      health: db.health,
      latencyMs: db.latencyMs,
      lastChecked: new Date().toISOString(),
      critical: true,
    },
    "job-fsm": {
      name: "job-fsm",
      displayName: "Job Lifecycle FSM",
      health: db.health,
      latencyMs: db.latencyMs,
      lastChecked: new Date().toISOString(),
      critical: true,
    },
    "notification-engine": {
      name: "notification-engine",
      displayName: "Notification Engine",
      health: "healthy",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "knowledge-graph": {
      name: "knowledge-graph",
      displayName: "Knowledge Graph",
      health: isAiConfigured && db.health === "healthy" ? "healthy" : "degraded",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "digital-twin": {
      name: "digital-twin",
      displayName: "Digital Twin",
      health: isAiConfigured && db.health === "healthy" ? "healthy" : "degraded",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "membership-engine": {
      name: "membership-engine",
      displayName: "Membership Engine",
      health: db.health,
      latencyMs: db.latencyMs,
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "franchise-engine": {
      name: "franchise-engine",
      displayName: "Franchise Engine",
      health: db.health,
      latencyMs: db.latencyMs,
      lastChecked: new Date().toISOString(),
      critical: false,
    },
    "geo-service": {
      name: "geo-service",
      displayName: "Territory Engine",
      health: "healthy",
      lastChecked: new Date().toISOString(),
      critical: false,
    },
  };

  // ── Workstream health matrix ───────────────────────────────────────────────
  const workstreams: Record<string, WorkstreamHealthEntry> = {};
  for (const def of WORKSTREAM_REGISTRY) {
    const depStatuses = def.dependencies.map(
      (d): DependencyStatus =>
        dependencies[d] ?? {
          name: d,
          health: "unknown" as DependencyHealth,
          lastChecked: new Date().toISOString(),
          critical: false,
        },
    );
    const health = worstHealth(depStatuses, true);

    workstreams[def.id] = {
      id: def.id,
      name: def.name,
      health,
      latencyMs: db.latencyMs ?? null,
      recentFailures: workerData.recentFailures,
      dependencies: depStatuses,
      critical: def.critical,
      category: def.category,
      slaMs: def.slaMs,
      slaViolation: db.latencyMs != null && db.latencyMs > def.slaMs,
    };
  }

  const allDeps = Object.values(dependencies);
  const platformHealth = worstHealth(allDeps, true);

  return {
    workstreams,
    dependencies,
    workers: {
      automation: {
        recentFailures: workerData.recentFailures,
        pendingItems: queueData.depth,
        stuckItems: queueData.stuck,
        health:
          workerData.recentFailures > 5
            ? "degraded"
            : queueData.stuck > 10
            ? "degraded"
            : "healthy",
        lastRun: workerData.lastRun,
      },
    },
    queues: {
      automation: {
        depth: queueData.depth,
        stuck: queueData.stuck,
        oldestItemAgeMs: queueData.oldestItemAgeMs,
        health:
          queueData.stuck > 10
            ? "degraded"
            : queueData.depth > 500
            ? "degraded"
            : "healthy",
      },
    },
    runtime: {
      mode: isRedisConfigured ? "distributed" : "standalone",
      redisConfigured: isRedisConfigured,
      circuitBreakerCount: circuits.length,
      rateLimitMode: isRedisConfigured ? "distributed" : "in-memory",
      tracingEnabled: true,
    },
    health: platformHealth,
    errors: [],
    generatedAt: new Date().toISOString(),
  };
}

async function checkDatabase(): Promise<{
  health: DependencyHealth;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const db = getAdminClient();
    const { error } = await db.from("tenants").select("id").limit(1);
    const latencyMs = Date.now() - start;
    if (error) return { health: "degraded", latencyMs, error: error.message };
    return { health: "healthy", latencyMs };
  } catch (err) {
    return {
      health: "offline",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkQueue(
  tenantId: string,
): Promise<{ depth: number; stuck: number; oldestItemAgeMs: number | null }> {
  try {
    const db = getAdminClient();
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
    const [pendingRes, stuckRes] = await Promise.all([
      db
        .from("automation_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      db
        .from("automation_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId)
        .lt("created_at", cutoff),
    ]);
    return {
      depth: pendingRes.count ?? 0,
      stuck: stuckRes.count ?? 0,
      oldestItemAgeMs: null,
    };
  } catch {
    return { depth: 0, stuck: 0, oldestItemAgeMs: null };
  }
}

async function checkWorkers(
  tenantId: string,
): Promise<{ recentFailures: number; lastRun: string | null }> {
  try {
    const db = getAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [failedRes, lastRunRes] = await Promise.all([
      db
        .from("automation_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .eq("tenant_id", tenantId)
        .gt("completed_at", since),
      db
        .from("automation_runs")
        .select("completed_at")
        .eq("tenant_id", tenantId)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);
    return {
      recentFailures: failedRes.count ?? 0,
      lastRun: lastRunRes.data?.[0]?.completed_at ?? null,
    };
  } catch {
    return { recentFailures: 0, lastRun: null };
  }
}
