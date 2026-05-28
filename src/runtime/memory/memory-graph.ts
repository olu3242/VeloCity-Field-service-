import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export async function linkMemory(input: {
  tenantId: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}) {
  const { data, error } = await getAdminClient()
    .from("memory_graph_edges")
    .insert({
      tenant_id: input.tenantId,
      from_memory_id: input.fromMemoryId,
      to_memory_id: input.toMemoryId,
      relation: input.relation,
      weight: input.weight ?? 0.5,
      metadata: input.metadata ?? {},
      correlation_id: input.correlationId ?? createCorrelationId("mgraph"),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getMemoryGraph(tenantId: string, limit = 100) {
  const { data, error } = await getAdminClient()
    .from("memory_graph_edges")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
