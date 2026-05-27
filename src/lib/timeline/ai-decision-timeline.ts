import { randomUUID } from "crypto";

export interface AIDecisionEntry {
  id: string;
  agentName: string;
  tenantId?: string;
  eventType: string;
  decision: string;
  confidence: number;
  timestamp: string;
  processingMs: number;
  contextKeys: string[];
}

const MAX_DECISIONS = 1000;
const AI_DECISIONS: AIDecisionEntry[] = [];

export function recordDecision(
  entry: Omit<AIDecisionEntry, "id">
): AIDecisionEntry {
  const full: AIDecisionEntry = { id: randomUUID(), ...entry };
  AI_DECISIONS.push(full);
  if (AI_DECISIONS.length > MAX_DECISIONS) {
    AI_DECISIONS.shift();
  }
  return full;
}

export function getDecisionsByAgent(
  agentName: string,
  limit = 20
): AIDecisionEntry[] {
  return AI_DECISIONS.filter((e) => e.agentName === agentName).slice(-limit);
}

export function getConfidenceTrend(
  agentName: string
): "improving" | "stable" | "declining" {
  const decisions = AI_DECISIONS.filter((e) => e.agentName === agentName);
  if (decisions.length < 2) return "stable";

  const last10 = decisions.slice(-10);
  const prev10 = decisions.slice(-20, -10);

  const avg = (arr: AIDecisionEntry[]): number => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, e) => sum + e.confidence, 0) / arr.length;
  };

  const lastAvg = avg(last10);
  const prevAvg = avg(prev10);
  const diff = lastAvg - prevAvg;

  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}

export function getDecisionStats(agentName: string): {
  avgConfidence: number;
  avgProcessingMs: number;
  totalDecisions: number;
} {
  const decisions = AI_DECISIONS.filter((e) => e.agentName === agentName);
  const total = decisions.length;
  if (total === 0) {
    return { avgConfidence: 0, avgProcessingMs: 0, totalDecisions: 0 };
  }
  const avgConfidence =
    decisions.reduce((sum, e) => sum + e.confidence, 0) / total;
  const avgProcessingMs =
    decisions.reduce((sum, e) => sum + e.processingMs, 0) / total;
  return { avgConfidence, avgProcessingMs, totalDecisions: total };
}
