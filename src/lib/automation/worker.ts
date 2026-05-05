import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { routeAutomationEvent } from "./router";
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
      await client.from("automation_queue").update({
        status: retryCount >= 3 ? "failed" : "pending",
        retry_count: retryCount,
        error_message: message,
        available_at: new Date(Date.now() + retryCount * 60_000).toISOString(),
        processed_at: retryCount >= 3 ? new Date().toISOString() : null,
      }).eq("id", row.id);
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

  result.skipped = Math.max(0, limit - result.processed);
  return result;
}
