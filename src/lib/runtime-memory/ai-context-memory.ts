/**
 * AI Context Memory — stores per-agent contextual entries with weighted relevance.
 * Cap: 50 entries per agent.
 */

export interface AIContextEntry {
  id: string;
  agentName: string;
  tenantId: string;
  contextType: "prior_decision" | "user_preference" | "pattern" | "constraint";
  content: string;
  weight: number;
  createdAt: string;
}

export const AI_CONTEXT: Map<string, AIContextEntry[]> = new Map();
const PER_AGENT_CAP = 50;

export function storeContext(
  agentName: string,
  tenantId: string,
  contextType: AIContextEntry["contextType"],
  content: string,
  weight: number
): AIContextEntry {
  const entry: AIContextEntry = {
    id: crypto.randomUUID(),
    agentName,
    tenantId,
    contextType,
    content,
    weight,
    createdAt: new Date().toISOString(),
  };

  const existing = AI_CONTEXT.get(agentName) ?? [];

  if (existing.length >= PER_AGENT_CAP) {
    // Remove lowest-weight entry to make room
    let minIdx = 0;
    for (let i = 1; i < existing.length; i++) {
      if (existing[i].weight < existing[minIdx].weight) minIdx = i;
    }
    existing.splice(minIdx, 1);
  }

  existing.push(entry);
  AI_CONTEXT.set(agentName, existing);
  return entry;
}

export function getContext(
  agentName: string,
  contextType?: AIContextEntry["contextType"]
): AIContextEntry[] {
  const entries = AI_CONTEXT.get(agentName) ?? [];
  if (!contextType) return entries;
  return entries.filter((e) => e.contextType === contextType);
}

export function pruneContext(agentName: string, minWeight: number): number {
  const entries = AI_CONTEXT.get(agentName);
  if (!entries) return 0;
  const before = entries.length;
  const kept = entries.filter((e) => e.weight >= minWeight);
  AI_CONTEXT.set(agentName, kept);
  return before - kept.length;
}

export function getTopContext(agentName: string, limit = 10): AIContextEntry[] {
  const entries = AI_CONTEXT.get(agentName) ?? [];
  return Array.from(entries)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}
