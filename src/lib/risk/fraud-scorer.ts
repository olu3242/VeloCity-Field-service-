export interface FraudSignal {
  type: "velocity" | "pattern" | "identity" | "network" | "behavioral";
  weight: number;
  description: string;
}

export interface FraudScore {
  entityId: string;
  entityType: "provider" | "customer" | "tenant";
  score: number;
  signals: FraudSignal[];
  verdict: "clean" | "suspicious" | "fraud";
}

const FRAUD_SCORES: Map<string, FraudScore> = new Map();

export function scoreFraud(
  entityId: string,
  entityType: FraudScore["entityType"],
  signals: FraudSignal[]
): FraudScore {
  const rawScore = signals.reduce((s, sig) => s + sig.weight * 100, 0);
  const score = Math.min(100, rawScore);

  const verdict: FraudScore["verdict"] =
    score >= 80 ? "fraud" : score >= 40 ? "suspicious" : "clean";

  const result: FraudScore = { entityId, entityType, score, signals, verdict };
  FRAUD_SCORES.set(entityId, result);
  return result;
}

export function getFraudScore(entityId: string): FraudScore | undefined {
  return FRAUD_SCORES.get(entityId);
}

export function getHighRiskEntities(threshold?: number): FraudScore[] {
  const cutoff = threshold ?? 40;
  return Array.from(FRAUD_SCORES.values()).filter((f) => f.score >= cutoff);
}

export function clearScore(entityId: string): void {
  FRAUD_SCORES.delete(entityId);
}
