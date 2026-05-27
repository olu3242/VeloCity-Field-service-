export interface ReplayChainEntry {
  id: string;
  originalEventId: string;
  eventType: string;
  tenantId?: string;
  replayedAt: string;
  replayedBy: string;
  outcome: "success" | "failed" | "pending";
  parentReplayId?: string;
}

const MAX_ENTRIES = 500;
const REPLAY_CHAIN: ReplayChainEntry[] = [];

export function recordReplay(
  entry: Omit<ReplayChainEntry, "id" | "replayedAt">
): ReplayChainEntry {
  if (REPLAY_CHAIN.length >= MAX_ENTRIES) {
    REPLAY_CHAIN.shift();
  }
  const record: ReplayChainEntry = {
    ...entry,
    id: crypto.randomUUID(),
    replayedAt: new Date().toISOString(),
  };
  REPLAY_CHAIN.push(record);
  return record;
}

export function getReplayHistory(
  eventType?: string,
  limit = 20
): ReplayChainEntry[] {
  const filtered = eventType
    ? REPLAY_CHAIN.filter((e) => e.eventType === eventType)
    : REPLAY_CHAIN.slice();
  return filtered.slice(-limit);
}

export function getReplayChainFor(originalEventId: string): ReplayChainEntry[] {
  return REPLAY_CHAIN.filter((e) => e.originalEventId === originalEventId);
}

export function updateReplayOutcome(
  id: string,
  outcome: ReplayChainEntry["outcome"]
): void {
  const entry = REPLAY_CHAIN.find((e) => e.id === id);
  if (entry) {
    entry.outcome = outcome;
  }
}
