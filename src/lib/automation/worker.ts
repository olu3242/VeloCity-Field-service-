import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRuntimePaused } from "@/lib/governance/operator";
import { routeAutomationEvent } from "./router";
import type { AutomationQueueRow } from "./types";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";

const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_RETRIES = 3;
const PROCESSING_TIMEOUT_MS = 10 * 60_000; // 10 minutes

// Exponential backoff with full jitter (1, 2, 4 min base, randomized) —
// replaces the prior linear (1/2/3 min) schedule so retries spread out
// instead of converging on the same retry window under bursty failures.
function retryDelayMs(retryCount: number): number {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (retryCount - 1));
  return Math.floor(Math.random() * exponential);
}

export interface AutomationWorkerResult {
  processed: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ queueId: string; message: string }>;
}

/**
 * Reset any rows that have been stuck in "processing" for longer than
 * PROCESSING_TIMEOUT_MS. This guards against worker crashes that leave rows
 * indefinitely locked, which would silently block replay for those events.
 */
async function resetTimedOutRows(client: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS).toISOString();
  const { data, error } = await client
    .from("automation_queue")
    .update({
      status: "failed",
      error_message: "Processing timeout",
      processed_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("[worker] timeout cleanup error:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function processAutomationQueue(
  supabase?: SupabaseClient,
  limit = 10,
  tenantId?: string
): Promise<AutomationWorkerResult> {
  const client = supabase ?? getAdminClient();
  const result: AutomationWorkerResult = { processed: 0, completed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };

  // Operator-paused runtime holds all events: leave the queue untouched so
  // pending/failed rows pick back up exactly where they were once resumed.
  if (isRuntimePaused()) {
    return { ...result, skipped: limit };
  }

  // Cleanup: reset rows stuck in "processing" beyond the timeout threshold
  // before fetching the next batch so they can be retried this run.
  await resetTimedOutRows(client);

  let query = client
    .from("automation_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data: rows, error } = await query;

  if (error) {
    return { ...result, failed: 1, errors: [{ queueId: "query", message: error.message }] };
  }

  for (const row of (rows ?? []) as AutomationQueueRow[]) {
    result.processed += 1;

    // Idempotency check: if the same logical event (same event_id) already has
    // another queue row that is "processing" or "completed", skip this one to
    // prevent duplicate execution when events are re-queued via replay.
    if (row.event_id) {
      const { data: duplicates } = await client
        .from("automation_queue")
        .select("id, status")
        .eq("event_id", row.event_id)
        .in("status", ["processing", "completed"])
        .neq("id", row.id)
        .limit(1);

      if (duplicates && duplicates.length > 0) {
        const dup = duplicates[0] as { id: string; status: string };

        if (dup.status === "completed") {
          // The event was already processed successfully by another queue row.
          // Mark this row completed with a note so it doesn't block the queue.
          await client.from("automation_queue").update({
            status: "completed",
            processed_at: new Date().toISOString(),
            error_message: `Skipped: event already completed by queue row ${dup.id}`,
          }).eq("id", row.id);
          result.completed += 1;
          result.skipped += 1;
        } else {
          // Another row is currently "processing" the same event. Leave this
          // row as pending — it will be re-evaluated on the next worker run,
          // at which point the other row will have either completed or timed out.
          result.skipped += 1;
        }
        continue;
      }
    }

    const startedAt = new Date().toISOString();
    await client.from("automation_queue").update({ status: "processing", error_message: null }).eq("id", row.id);
    const { data: run } = await client
      .from("automation_runs")
      .insert({
        tenant_id: row.tenant_id ?? undefined,
        queue_id: row.id,
        event_id: row.event_id,
        event_type: row.event_type,
        status: "processing",
        started_at: startedAt,
      })
      .select("id")
      .single();

    try {
      const routed = await routeAutomationEvent(row.event_type, { ...(row.payload ?? {}), tenant_id: row.tenant_id }, client);
      await client.from("automation_queue").update({
        status: "completed",
        processed_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", row.id);
      if (run?.id) {
        await client.from("automation_runs").update({
          status: "completed",
          actions: routed.actions,
          output: routed.output,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
      result.completed += 1;
      result.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryCount = Number(row.retry_count ?? 0) + 1;
      const exhausted = retryCount >= MAX_RETRIES;

      await client.from("automation_queue").update({
        status: exhausted ? "failed" : "pending",
        retry_count: retryCount,
        error_message: message,
        available_at: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
        processed_at: exhausted ? new Date().toISOString() : null,
      }).eq("id", row.id);

      if (exhausted) {
        // Move to dead letter queue so ops can inspect and manually resolve
        // without losing the original event data.
        await client.from("automation_dead_letters").insert({
          tenant_id: row.tenant_id ?? DEFAULT_TENANT_ID,
          original_queue_id: row.id,
          event_type: row.event_type,
          payload: row.payload ?? {},
          error_message: message,
          retry_count: retryCount,
        });
      }

      if (run?.id) {
        await client.from("automation_runs").update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
      result.failed += 1;
      result.errors.push({ queueId: row.id, message });
    }
  }

  result.skipped = Math.max(result.skipped, limit - result.processed);
  return result;
}
