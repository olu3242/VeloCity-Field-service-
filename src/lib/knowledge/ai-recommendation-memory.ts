export interface AIRecommendation {
  id: string;
  agentName: string;
  tenantId?: string;
  domain: string;
  recommendation: string;
  confidence: number;
  accepted?: boolean;
  acceptedAt?: string;
  outcome?: "positive" | "negative" | "neutral";
  outcomeRecordedAt?: string;
  createdAt: string;
}

const RECOMMENDATIONS: Map<string, AIRecommendation> = new Map();

const RECOMMENDATIONS_CAP = 1000;

export function storeRecommendation(
  rec: Omit<AIRecommendation, "id" | "createdAt">
): AIRecommendation {
  if (RECOMMENDATIONS.size >= RECOMMENDATIONS_CAP) {
    const oldestKey = RECOMMENDATIONS.keys().next().value;
    if (oldestKey !== undefined) {
      RECOMMENDATIONS.delete(oldestKey);
    }
  }

  const entry: AIRecommendation = {
    ...rec,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  RECOMMENDATIONS.set(entry.id, entry);
  return entry;
}

export function recordAcceptance(id: string, accepted: boolean): void {
  const rec = RECOMMENDATIONS.get(id);
  if (!rec) return;
  rec.accepted = accepted;
  rec.acceptedAt = new Date().toISOString();
}

export function recordOutcome(
  id: string,
  outcome: AIRecommendation["outcome"]
): void {
  const rec = RECOMMENDATIONS.get(id);
  if (!rec) return;
  rec.outcome = outcome;
  rec.outcomeRecordedAt = new Date().toISOString();
}

export function getRecommendationsByAgent(
  agentName: string,
  limit = 20
): AIRecommendation[] {
  const results: AIRecommendation[] = [];
  for (const rec of Array.from(RECOMMENDATIONS.values())) {
    if (rec.agentName === agentName) {
      results.push(rec);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function getAcceptanceStats(domain?: string): {
  acceptanceRate: number;
  positiveOutcomeRate: number;
  totalRecommendations: number;
} {
  const all = Array.from(RECOMMENDATIONS.values()).filter(
    (r) => !domain || r.domain === domain
  );

  const total = all.length;
  if (total === 0) {
    return { acceptanceRate: 0, positiveOutcomeRate: 0, totalRecommendations: 0 };
  }

  let acceptedCount = 0;
  let positiveCount = 0;
  let withOutcome = 0;

  for (const rec of all) {
    if (rec.accepted === true) acceptedCount++;
    if (rec.outcomeRecordedAt !== undefined) {
      withOutcome++;
      if (rec.outcome === "positive") positiveCount++;
    }
  }

  return {
    totalRecommendations: total,
    acceptanceRate: acceptedCount / total,
    positiveOutcomeRate: withOutcome === 0 ? 0 : positiveCount / withOutcome,
  };
}
