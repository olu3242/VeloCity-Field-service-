/**
 * Provider Trust Scores — signal-weighted trust computation with fraud adjustment.
 */

export interface TrustSignal {
  type: string;
  weight: number;
  detail: string;
}

export interface ProviderTrustScore {
  providerId: string;
  tenantId: string;
  trustScore: number;
  signals: TrustSignal[];
  level: "trusted" | "neutral" | "at_risk" | "blocked";
  lastUpdatedAt: string;
}

const TRUST_SCORES: Map<string, ProviderTrustScore> = new Map();

function computeLevel(score: number): ProviderTrustScore["level"] {
  if (score >= 80) return "trusted";
  if (score >= 50) return "neutral";
  if (score >= 25) return "at_risk";
  return "blocked";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function updateProviderTrust(
  providerId: string,
  tenantId: string,
  signals: TrustSignal[]
): ProviderTrustScore {
  const weightSum = signals.reduce((s, sig) => s + sig.weight * 100, 0);
  const trustScore = clamp(50 + weightSum, 0, 100);
  const level = computeLevel(trustScore);
  const record: ProviderTrustScore = {
    providerId,
    tenantId,
    trustScore,
    signals,
    level,
    lastUpdatedAt: new Date().toISOString(),
  };
  TRUST_SCORES.set(providerId, record);
  return record;
}

export function getProviderTrust(providerId: string): ProviderTrustScore | undefined {
  return TRUST_SCORES.get(providerId);
}

export function getUntrustedProviders(tenantId?: string): ProviderTrustScore[] {
  return Array.from(TRUST_SCORES.values()).filter(
    (p) =>
      (p.level === "at_risk" || p.level === "blocked") &&
      (tenantId === undefined || p.tenantId === tenantId)
  );
}

export function adjustForFraud(providerId: string, penalty: number): void {
  const record = TRUST_SCORES.get(providerId);
  if (!record) return;
  const trustScore = Math.max(0, record.trustScore - penalty);
  TRUST_SCORES.set(providerId, {
    ...record,
    trustScore,
    level: computeLevel(trustScore),
    lastUpdatedAt: new Date().toISOString(),
  });
}
