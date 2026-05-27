/**
 * Customer Reputation — dispute, payment, and resolution-weighted reputation scoring.
 */

export interface CustomerReputation {
  customerId: string;
  tenantId: string;
  reputationScore: number;
  disputeCount: number;
  resolvedInFavor: number;
  paymentReliability: number;
  level: "excellent" | "good" | "fair" | "poor";
  lastUpdatedAt: string;
}

const REPUTATIONS: Map<string, CustomerReputation> = new Map();

function computeLevel(score: number): CustomerReputation["level"] {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

function computeScore(
  paymentReliability: number,
  disputeCount: number,
  resolvedInFavor: number
): number {
  const disputePenalty = 1 - Math.min(1, disputeCount / 10);
  const favorRatio = resolvedInFavor / Math.max(1, disputeCount);
  return paymentReliability * 50 + disputePenalty * 30 + favorRatio * 20;
}

export function updateReputation(
  customerId: string,
  tenantId: string,
  updates: Partial<Pick<CustomerReputation, "disputeCount" | "resolvedInFavor" | "paymentReliability">>
): CustomerReputation {
  const existing = REPUTATIONS.get(customerId);
  const disputeCount = updates.disputeCount ?? existing?.disputeCount ?? 0;
  const resolvedInFavor = updates.resolvedInFavor ?? existing?.resolvedInFavor ?? 0;
  const paymentReliability = updates.paymentReliability ?? existing?.paymentReliability ?? 0;
  const reputationScore = computeScore(paymentReliability, disputeCount, resolvedInFavor);
  const record: CustomerReputation = {
    customerId,
    tenantId,
    reputationScore,
    disputeCount,
    resolvedInFavor,
    paymentReliability,
    level: computeLevel(reputationScore),
    lastUpdatedAt: new Date().toISOString(),
  };
  REPUTATIONS.set(customerId, record);
  return record;
}

export function getReputation(customerId: string): CustomerReputation | undefined {
  return REPUTATIONS.get(customerId);
}

export function getLowReputationCustomers(tenantId?: string): CustomerReputation[] {
  return Array.from(REPUTATIONS.values()).filter(
    (r) =>
      (r.level === "fair" || r.level === "poor") &&
      (tenantId === undefined || r.tenantId === tenantId)
  );
}
