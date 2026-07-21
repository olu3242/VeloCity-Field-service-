// Enterprise Memory — Supabase-backed organizational memory.
// Stores decisions, outcomes, incidents, lessons, and recommendations
// with tenant isolation and semantic search via ilike.

import { getAdminClient } from "@/lib/supabase/admin";

export type MemoryCategory =
  | "decision" | "outcome" | "incident" | "lesson" | "recommendation" | "forecast";

export type MemoryImportance = "low" | "normal" | "high" | "critical";

export interface EnterpriseMemoryEntry {
  id: string;
  tenant_id: string;
  category: MemoryCategory;
  entity_type: string | null;
  entity_id: string | null;
  actor_type: string;
  actor_id: string | null;
  summary: string;
  detail: Record<string, unknown>;
  tags: string[];
  importance: MemoryImportance;
  created_at: string;
}

export interface StoreMemoryInput {
  tenantId: string;
  category: MemoryCategory;
  entityType?: string;
  entityId?: string;
  actorType?: string;
  actorId?: string;
  summary: string;
  detail?: Record<string, unknown>;
  tags?: string[];
  importance?: MemoryImportance;
}

export async function storeEnterpriseMemory(input: StoreMemoryInput): Promise<void> {
  const db = getAdminClient();
  await db.from("enterprise_memory").insert({
    tenant_id: input.tenantId,
    category: input.category,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    actor_type: input.actorType ?? "system",
    actor_id: input.actorId ?? null,
    summary: input.summary,
    detail: input.detail ?? {},
    tags: input.tags ?? [],
    importance: input.importance ?? "normal",
  });
}

export async function retrieveMemories(
  tenantId: string,
  options: {
    category?: MemoryCategory;
    entityType?: string;
    entityId?: string;
    importance?: MemoryImportance;
    limit?: number;
  } = {}
): Promise<EnterpriseMemoryEntry[]> {
  const db = getAdminClient();
  const filters: Record<string, string> = { tenant_id: tenantId };
  if (options.category) filters.category = options.category;
  if (options.entityType) filters.entity_type = options.entityType;
  if (options.entityId) filters.entity_id = options.entityId;
  if (options.importance) filters.importance = options.importance;

  const { data } = await db.from("enterprise_memory")
    .select("*")
    .match(filters)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  return (data ?? []) as EnterpriseMemoryEntry[];
}

export async function findSimilarCases(
  tenantId: string,
  searchText: string,
  limit = 10
): Promise<EnterpriseMemoryEntry[]> {
  const db = getAdminClient();
  const { data } = await db.from("enterprise_memory")
    .select("*")
    .eq("tenant_id", tenantId)
    .ilike("summary", `%${searchText}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as EnterpriseMemoryEntry[];
}

export async function getMemoryStats(tenantId: string): Promise<Record<string, number>> {
  const db = getAdminClient();
  const { data } = await db.from("enterprise_memory")
    .select("category")
    .eq("tenant_id", tenantId);

  const stats: Record<string, number> = {};
  for (const row of data ?? []) {
    const cat = row.category as string;
    stats[cat] = (stats[cat] ?? 0) + 1;
  }
  return stats;
}
