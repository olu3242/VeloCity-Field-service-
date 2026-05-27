export interface CopilotMemoryEntry {
  id: string
  operatorId: string
  memoryType: "preference" | "pattern" | "resolution" | "escalation"
  key: string
  value: string
  weight: number
  recordedAt: string
}

const MEMORY: Map<string, CopilotMemoryEntry[]> = new Map()
const CAP_PER_OPERATOR = 100

export function remember(
  operatorId: string,
  memoryType: CopilotMemoryEntry["memoryType"],
  key: string,
  value: string,
  weight = 0.8
): CopilotMemoryEntry {
  const entry: CopilotMemoryEntry = {
    id: crypto.randomUUID(),
    operatorId,
    memoryType,
    key,
    value,
    weight: Math.min(1, Math.max(0, weight)),
    recordedAt: new Date().toISOString(),
  }

  const existing = MEMORY.get(operatorId) ?? []
  if (existing.length >= CAP_PER_OPERATOR) existing.shift()
  existing.push(entry)
  MEMORY.set(operatorId, existing)
  return entry
}

export function recall(operatorId: string, key: string): CopilotMemoryEntry | undefined {
  const entries = MEMORY.get(operatorId) ?? []
  return entries
    .filter(e => e.key === key)
    .sort((a, b) => b.weight - a.weight)[0]
}

export function getOperatorMemory(
  operatorId: string,
  memoryType?: CopilotMemoryEntry["memoryType"]
): CopilotMemoryEntry[] {
  const entries = MEMORY.get(operatorId) ?? []
  if (memoryType !== undefined) return entries.filter(e => e.memoryType === memoryType)
  return entries
}

export function pruneOldMemory(operatorId: string, minWeight: number): number {
  const entries = MEMORY.get(operatorId) ?? []
  const before = entries.length
  const pruned = entries.filter(e => e.weight >= minWeight)
  MEMORY.set(operatorId, pruned)
  return before - pruned.length
}
