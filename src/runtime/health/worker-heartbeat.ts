import "@/runtime/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_WORKER_ID = "local-automation-worker";

export async function recordWorkerHeartbeat(
  supabase: SupabaseClient,
  input: {
    workerId?: string;
    status?: "online" | "processing" | "idle" | "error";
    processedCount?: number;
    failedCount?: number;
    metadata?: Record<string, unknown>;
  } = {}
) {
  const workerId = input.workerId ?? DEFAULT_WORKER_ID;
  await supabase
    .from("worker_heartbeats")
    .upsert({
      worker_id: workerId,
      worker_type: "automation",
      status: input.status ?? "online",
      last_seen_at: new Date().toISOString(),
      processed_count: input.processedCount ?? 0,
      failed_count: input.failedCount ?? 0,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "worker_id" })
    .then(() => null);
}
