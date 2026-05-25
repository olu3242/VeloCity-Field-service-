/**
 * VeloCity Contracts — Platform Health
 *
 * Provides a real-time snapshot of the automation runtime health.
 * Called by the admin automation page and any health-check endpoint.
 *
 * Import directly (not via index.ts barrel) when you need the async function.
 */

import type { PlatformHealth, QueueHealth } from "./runtime";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Fetches a real-time health snapshot from the database.
 *
 * Queries:
 * - automation_queue for queue depth/status breakdown
 * - automation_runs for the most recent completed run timestamp
 *
 * Health thresholds:
 * - automation_engine "degraded" if > 10 permanently-failed items
 * - automation_engine "down" if the queue query itself fails
 *
 * @returns PlatformHealth snapshot
 */
export async function getPlatformHealth(): Promise<PlatformHealth> {
  const now = new Date().toISOString();
  const adminDb = getAdminClient();

  const [queueResult, lastRunResult] = await Promise.all([
    adminDb
      .from("automation_queue")
      .select("status, created_at"),
    adminDb
      .from("automation_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1),
  ]);

  // If the queue query itself fails, the engine is "down"
  if (queueResult.error) {
    return {
      automation_engine: "down",
      ai_runtime: "healthy",
      stripe: "healthy",
      queue: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        oldest_pending_age_ms: null,
      },
      last_processed_at: null,
      timestamp: now,
    };
  }

  const rows = (queueResult.data as Array<{ status: string; created_at: string }>) ?? [];

  const pending = rows.filter((r) => r.status === "pending").length;
  const processing = rows.filter((r) => r.status === "processing").length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  // Find the oldest pending item
  const pendingAges = rows
    .filter((r) => r.status === "pending")
    .map((r) => Date.now() - new Date(r.created_at).getTime());
  const oldestPendingAge = pendingAges.length > 0 ? Math.max(...pendingAges) : null;

  const queue: QueueHealth = {
    total: rows.length,
    pending,
    processing,
    completed,
    failed,
    oldest_pending_age_ms: oldestPendingAge,
  };

  const lastRuns = (lastRunResult.data as Array<{ started_at: string }>) ?? [];
  const lastProcessedAt = lastRuns[0]?.started_at ?? null;

  // Degrade if > 10 permanently failed items
  const engineStatus = failed > 10 ? "degraded" : "healthy";

  return {
    automation_engine: engineStatus,
    ai_runtime: "healthy",
    stripe: "healthy",
    queue,
    last_processed_at: lastProcessedAt,
    timestamp: now,
  };
}
