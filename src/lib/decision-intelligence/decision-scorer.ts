/**
 * Decision Scorer — records agent decisions and tracks outcome accuracy.
 * Cap: 1000 records (rolling).
 */

export interface DecisionRecord {
  id: string;
  agentName: string;
  eventType: string;
  tenantId: string;
  decision: string;
  confidence: number;
  outcome?: "correct" | "incorrect" | "unknown";
  scoreAdjustment: number;
  recordedAt: string;
}

export const DECISIONS: DecisionRecord[] = [];
const CAP = 1000;

export function recordDecision(
  agentName: string,
  eventType: string,
  tenantId: string,
  decision: string,
  confidence: number
): DecisionRecord {
  const record: DecisionRecord = {
    id: crypto.randomUUID(),
    agentName,
    eventType,
    tenantId,
    decision,
    confidence,
    outcome: "unknown",
    scoreAdjustment: 0,
    recordedAt: new Date().toISOString(),
  };

  if (DECISIONS.length >= CAP) {
    DECISIONS.splice(0, 1);
  }
  DECISIONS.push(record);
  return record;
}

export function recordOutcome(
  id: string,
  outcome: "correct" | "incorrect"
): void {
  const record = DECISIONS.find((d) => d.id === id);
  if (!record) return;
  record.outcome = outcome;
  record.scoreAdjustment = outcome === "correct" ? 1 : -1;
}

export function getDecisionsByAgent(
  agentName: string,
  limit = 50
): DecisionRecord[] {
  return DECISIONS.filter((d) => d.agentName === agentName).slice(-limit);
}

export function getAgentAccuracy(agentName: string): number {
  const resolved = DECISIONS.filter(
    (d) =>
      d.agentName === agentName &&
      (d.outcome === "correct" || d.outcome === "incorrect")
  );
  if (resolved.length === 0) return 0;
  const correct = resolved.filter((d) => d.outcome === "correct").length;
  return correct / resolved.length;
}

export function getRecentDecisions(limit = 20): DecisionRecord[] {
  return DECISIONS.slice(-limit);
}
