export type MemoryCategory =
  | "dispute_resolution"
  | "payment_recovery"
  | "sla_management"
  | "provider_action"
  | "anomaly_response"
  | "workflow_completion";

export interface OperationalMemory {
  id: string;
  category: MemoryCategory;
  tenantId?: string;
  summary: string;
  outcome: "success" | "failure" | "partial";
  agentInvolved?: string;
  contextKeys: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

const MEMORY_STORE: Map<string, OperationalMemory> = new Map();
const CATEGORY_INDEX: Map<MemoryCategory, string[]> = new Map();

const MEMORY_CAP = 2000;

export function storeMemory(
  memory: Omit<OperationalMemory, "id" | "createdAt">
): OperationalMemory {
  if (MEMORY_STORE.size >= MEMORY_CAP) {
    const oldestKey = MEMORY_STORE.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = MEMORY_STORE.get(oldestKey);
      MEMORY_STORE.delete(oldestKey);
      if (oldest) {
        const catIds = CATEGORY_INDEX.get(oldest.category);
        if (catIds) {
          const idx = catIds.indexOf(oldestKey);
          if (idx !== -1) catIds.splice(idx, 1);
        }
      }
    }
  }

  const record: OperationalMemory = {
    ...memory,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  MEMORY_STORE.set(record.id, record);

  const existing = CATEGORY_INDEX.get(record.category) ?? [];
  existing.push(record.id);
  CATEGORY_INDEX.set(record.category, existing);

  return record;
}

export function searchMemory(query: {
  category?: MemoryCategory;
  tenantId?: string;
  outcome?: string;
  contextKey?: string;
  limit?: number;
}): OperationalMemory[] {
  const limit = query.limit ?? 20;
  const results: OperationalMemory[] = [];

  for (const mem of Array.from(MEMORY_STORE.values())) {
    if (query.category && mem.category !== query.category) continue;
    if (query.tenantId && mem.tenantId !== query.tenantId) continue;
    if (query.outcome && mem.outcome !== query.outcome) continue;
    if (query.contextKey && !mem.contextKeys.includes(query.contextKey)) continue;
    results.push(mem);
    if (results.length >= limit) break;
  }

  return results;
}

export function getMemoryById(id: string): OperationalMemory | undefined {
  return MEMORY_STORE.get(id);
}

export function getRecentMemories(
  category?: MemoryCategory,
  limit = 20
): OperationalMemory[] {
  const all = Array.from(MEMORY_STORE.values()).filter(
    (m) => !category || m.category === category
  );
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function getMemoryStats(): {
  total: number;
  byCategory: Record<string, number>;
  successRate: number;
} {
  const all = Array.from(MEMORY_STORE.values());
  const total = all.length;
  const byCategory: Record<string, number> = {};
  let successCount = 0;

  for (const mem of all) {
    byCategory[mem.category] = (byCategory[mem.category] ?? 0) + 1;
    if (mem.outcome === "success") successCount++;
  }

  return {
    total,
    byCategory,
    successRate: total === 0 ? 0 : successCount / total,
  };
}
