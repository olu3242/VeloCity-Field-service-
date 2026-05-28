import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { routeAutomationEvent } from "./router";
import { recordWorkerHeartbeat } from "@/runtime/health/worker-heartbeat";
import { runtimeLogger } from "@/runtime/logging/logger";
import type { AutomationQueueRow } from "./types";

export interface AutomationWorkerResult {
  processed: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ queueId: string; message: string }>;
}

export async function processAutomationQueue(
  supabase?: SupabaseClient,
  limit = 10,
  tenantId?: string
): Promise<AutomationWorkerResult> {
  const client = supabase ?? getAdminClient();
  const result: AutomationWorkerResult = { processed: 0, completed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };
  await recordWorkerHeartbeat(client, { status: "processing", metadata: { limit, tenantId } });

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
    const startedAt = new Date().toISOString();
    const correlationId = typeof row.correlation_id === "string"
      ? row.correlation_id
      : typeof row.payload?.correlation_id === "string"
        ? row.payload.correlation_id
        : null;
    await client.from("automation_queue").update({ status: "processing", error_message: null }).eq("id", row.id);
    const { data: run } = await client
      .from("automation_runs")
      .insert({
        tenant_id: row.tenant_id ?? undefined,
        queue_id: row.id,
        event_id: row.event_id,
        event_type: row.event_type,
        handler: row.event_type,
        correlation_id: correlationId,
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
        const durationMs = Date.now() - new Date(startedAt).getTime();
        await client.from("automation_runs").update({
          status: "completed",
          actions: routed.actions,
          output: routed.output,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
      result.completed += 1;
      result.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryCount = Number(row.retry_count ?? 0) + 1;
      const permanentlyFailed = retryCount >= 3;
      await client.from("automation_queue").update({
        status: permanentlyFailed ? "failed" : "pending",
        retry_count: retryCount,
        error_message: message,
        available_at: new Date(Date.now() + retryCount * 60_000).toISOString(),
        processed_at: permanentlyFailed ? new Date().toISOString() : null,
      }).eq("id", row.id);
      if (permanentlyFailed) {
        await client.from("automation_dead_letters").insert({
          tenant_id: row.tenant_id ?? null,
          queue_id: row.id,
          event_id: row.event_id,
          event_type: row.event_type,
          correlation_id: correlationId,
          payload: row.payload ?? {},
          error_message: message,
          retry_count: retryCount,
          status: "open",
        }).then(() => null);
      }
      if (run?.id) {
        const durationMs = Date.now() - new Date(startedAt).getTime();
        await client.from("automation_runs").update({
          status: "failed",
          error_message: message,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
      result.failed += 1;
      result.errors.push({ queueId: row.id, message });
      runtimeLogger.error("automation_queue_item_failed", {
        queue_id: row.id,
        event_type: row.event_type,
        correlation_id: correlationId,
        retry_count: retryCount,
        permanently_failed: permanentlyFailed,
        error: message,
      });
    }
  }

  result.skipped = Math.max(0, limit - result.processed);
  await recordWorkerHeartbeat(client, {
    status: result.failed > 0 ? "error" : "idle",
    processedCount: result.processed,
    failedCount: result.failed,
    metadata: { completed: result.completed, skipped: result.skipped },
  });
  return result;
}
