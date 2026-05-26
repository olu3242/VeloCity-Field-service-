export type MemoryType =
  | "intervention"
  | "failure"
  | "recovery"
  | "optimization"
  | "resolution"
  | "pattern";

export interface ExecutionMemory {
  id: string;
  type: MemoryType;
  domain: string;
  summary: string;
  detail: Record<string, unknown>;
  outcome: "successful" | "partial" | "failed";
  confidence: number;
  timesReferenced: number;
  lastReferencedAt?: string;
  createdAt: string;
}

const MEMORY_STORE = new Map<string, ExecutionMemory>();

export function recordMemory(
  mem: Omit<ExecutionMemory, "id" | "createdAt" | "timesReferenced">
): ExecutionMemory {
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: ExecutionMemory = {
    ...mem,
    id,
    createdAt: new Date().toISOString(),
    timesReferenced: 0,
  };
  MEMORY_STORE.set(id, full);
  return full;
}

export function recallMemory(
  domain: string,
  type?: MemoryType,
  minConfidence = 0.5
): ExecutionMemory[] {
  const now = new Date().toISOString();
  const results = Array.from(MEMORY_STORE.values()).filter(
    (m) =>
      m.domain === domain &&
      (type === undefined || m.type === type) &&
      m.confidence >= minConfidence
  );

  for (const m of results) {
    m.timesReferenced += 1;
    m.lastReferencedAt = now;
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export function findSimilarResolutions(
  domain: string,
  outcomeType: ExecutionMemory["outcome"]
): ExecutionMemory[] {
  return Array.from(MEMORY_STORE.values()).filter(
    (m) => m.domain === domain && m.outcome === outcomeType
  );
}

export function getMemorySummary(): {
  total: number;
  byDomain: Record<string, number>;
  avgConfidence: number;
  topMemories: ExecutionMemory[];
} {
  const all = Array.from(MEMORY_STORE.values());
  const byDomain: Record<string, number> = {};

  for (const m of all) {
    byDomain[m.domain] = (byDomain[m.domain] ?? 0) + 1;
  }

  const avgConfidence =
    all.length > 0
      ? all.reduce((sum, m) => sum + m.confidence, 0) / all.length
      : 0;

  const topMemories = [...all]
    .sort((a, b) => b.timesReferenced - a.timesReferenced)
    .slice(0, 3);

  return { total: all.length, byDomain, avgConfidence, topMemories };
}
