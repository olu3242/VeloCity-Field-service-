import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export type MemoryScope = "tenant" | "provider" | "workflow" | "dispatch" | "crm" | "predictive";

export async function storeContextMemory(input: {
  tenantId: string;
  scope: MemoryScope;
  contextKey: string;
  value: Record<string, unknown>;
  subjectId?: string;
  workflowId?: string;
  confidence?: number;
  ttlMs?: number;
  correlationId?: string;
}) {
  const expiresAt = input.ttlMs ? new Date(Date.now() + input.ttlMs).toISOString() : null;
  const { data, error } = await getAdminClient()
    .from("orchestration_memory")
    .insert({
      tenant_id: input.tenantId,
      scope: input.scope,
      subject_id: input.subjectId ?? null,
      workflow_id: input.workflowId ?? null,
      context_key: input.contextKey,
      value: input.value,
      confidence: input.confidence ?? 0.75,
      correlation_id: input.correlationId ?? createCorrelationId("mem"),
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function recallContextMemory(input: {
  tenantId: string;
  scope?: MemoryScope;
  subjectId?: string;
  workflowId?: string;
  limit?: number;
}) {
  let query = getAdminClient()
    .from("orchestration_memory")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 25);

  if (input.scope) query = query.eq("scope", input.scope);
  if (input.subjectId) query = query.eq("subject_id", input.subjectId);
  if (input.workflowId) query = query.eq("workflow_id", input.workflowId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
