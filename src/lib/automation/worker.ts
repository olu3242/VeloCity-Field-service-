// VeloCity Automation Engine — Queue Worker
// Processes pending queue items, retries with exponential backoff

import { getAdminClient } from "@/lib/supabase/admin";
import { route } from "./router";
import type { AutomationQueueItem } from "@/types/automation";

const MAX_BATCH = 10;
const BASE_RETRY_DELAY_MS = 30_000; // 30s → 60s → 120s

export interface WorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function processAutomationQueue(): Promise<WorkerResult> {
  const db = getAdminClient();
  const result: WorkerResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  // ── 1. Pull pending + due items ──────────────────────────
  const { data: items, error } = await db
    .from("automation_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error("[worker] Failed to fetch queue:", error.message);
    return result;
  }

  if (!items || items.length === 0) return result;

  // ── 2. Process each item sequentially ───────────────────
  for (const raw of items) {
    const item = raw as unknown as AutomationQueueItem;

    // Skip if exceeds max retries
    if (item.retry_count >= item.max_retries) {
      await db
        .from("automation_queue")
        .update({ status: "skipped", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      result.skipped++;
      continue;
    }

    // Mark as processing (optimistic lock)
    const { error: lockError } = await db
      .from("automation_queue")
      .update({ status: "processing" })
      .eq("id", item.id)
      .eq("status", item.status); // CAS

    if (lockError) continue; // Another worker grabbed it

    result.processed++;
    const runStart = Date.now();

    // ── 3. Record run start ──────────────────────────────
    const { data: run } = await db
      .from("automation_runs")
      .insert({
        queue_id: item.id,
        event_type: item.event_type,
        handler: item.event_type,
        input: item.payload as Record<string, unknown>,
        status: "running",
      })
      .select("id")
      .single();

    try {
      // ── 4. Execute handler ─────────────────────────────
      const handlerResult = await route(item.event_type, item.payload, item);
      const durationMs = Date.now() - runStart;

      if (handlerResult.success) {
        // Mark queue item completed
        await db.from("automation_queue").update({
          status: "completed",
          processed_at: new Date().toISOString(),
        }).eq("id", item.id);

        // Update run record
        if (run) {
          await db.from("automation_runs").update({
            status: "completed",
            output: handlerResult.output ?? {},
            duration_ms: durationMs,
            completed_at: new Date().toISOString(),
          }).eq("id", run.id);
        }

        // Update parent event
        if (item.event_id) {
          await db.from("automation_events").update({
            status: "completed",
            processed_at: new Date().toISOString(),
          }).eq("id", item.event_id);
        }

        result.succeeded++;
      } else {
        throw new Error(handlerResult.error ?? "Handler returned failure");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - runStart;
      const newRetryCount = item.retry_count + 1;
      const reachedMax = newRetryCount >= item.max_retries;

      // Exponential backoff: 30s, 60s, 120s
      const backoffMs = BASE_RETRY_DELAY_MS * Math.pow(2, item.retry_count);
      const nextRetry = new Date(Date.now() + backoffMs).toISOString();

      await db.from("automation_queue").update({
        status: reachedMax ? "failed" : "failed", // stays failed until next_retry_at
        retry_count: newRetryCount,
        next_retry_at: reachedMax ? new Date().toISOString() : nextRetry,
        error_message: errorMsg,
        processed_at: reachedMax ? new Date().toISOString() : null,
      }).eq("id", item.id);

      if (run) {
        await db.from("automation_runs").update({
          status: "failed",
          error_message: errorMsg,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }

      console.error(`[worker] Handler failed for ${item.event_type} (attempt ${newRetryCount}):`, errorMsg);
      result.failed++;
    }
  }

  return result;
}
