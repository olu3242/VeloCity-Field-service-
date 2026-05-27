export interface ReasoningEntry {
  id: string;
  agentName: string;
  eventType: string;
  tenantId?: string;
  decision: string;
  reasoning: string[];
  confidence: number;
  evidenceKeys: string[];
  timestamp: string;
}

const MAX_ENTRIES = 1000;
const REASONING_LOG: ReasoningEntry[] = [];

export function logReasoning(
  entry: Omit<ReasoningEntry, "id" | "timestamp">
): ReasoningEntry {
  if (REASONING_LOG.length >= MAX_ENTRIES) {
    REASONING_LOG.shift();
  }
  const record: ReasoningEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  REASONING_LOG.push(record);
  return record;
}

export function getReasoningByAgent(
  agentName: string,
  limit = 20
): ReasoningEntry[] {
  return REASONING_LOG.filter((e) => e.agentName === agentName).slice(-limit);
}

export function getReasoningByDecision(
  decision: string,
  limit = 20
): ReasoningEntry[] {
  return REASONING_LOG.filter((e) => e.decision === decision).slice(-limit);
}

export function getRecentReasoning(limit = 20): ReasoningEntry[] {
  return REASONING_LOG.slice(-limit);
}

export function searchReasoning(query: string): ReasoningEntry[] {
  const q = query.toLowerCase();
  return REASONING_LOG.filter(
    (e) =>
      e.reasoning.some((r) => r.toLowerCase().includes(q)) ||
      e.decision.toLowerCase().includes(q)
  );
}
