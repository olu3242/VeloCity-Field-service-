export interface PayoutRecord {
  id: string;
  tenantId: string;
  amountUsd: number;
  processingMs: number;
  success: boolean;
  method: string;
  periodLabel: string;
}

export interface DisputeRecord {
  id: string;
  tenantId: string;
  amountUsd: number;
  resolvedMs?: number;
  autoResolved: boolean;
  outcome: "won" | "lost" | "settled" | "pending";
  periodLabel: string;
}

export interface PayoutAnalytics {
  tenantId: string;
  totalPayouts: number;
  successRate: number;
  avgProcessingMs: number;
  totalVolumeUsd: number;
}

export interface DisputeAnalytics {
  tenantId: string;
  totalDisputes: number;
  autoResolvedRate: number;
  avgResolutionMs: number;
  winRate: number;
  totalValueUsd: number;
}

const PAYOUTS: PayoutRecord[] = [];
const DISPUTES: DisputeRecord[] = [];
const PAYOUT_CAP = 1000;
const DISPUTE_CAP = 500;

export function recordPayout(record: PayoutRecord): void {
  PAYOUTS.push(record);
  if (PAYOUTS.length > PAYOUT_CAP) PAYOUTS.shift();
}

export function recordDispute(record: DisputeRecord): void {
  DISPUTES.push(record);
  if (DISPUTES.length > DISPUTE_CAP) DISPUTES.shift();
}

export function getPayoutAnalytics(tenantId: string): PayoutAnalytics {
  const records = PAYOUTS.filter((p) => p.tenantId === tenantId);
  const totalPayouts = records.length;
  const successRate = totalPayouts > 0
    ? records.filter((r) => r.success).length / totalPayouts
    : 0;
  const avgProcessingMs = totalPayouts > 0
    ? records.reduce((s, r) => s + r.processingMs, 0) / totalPayouts
    : 0;
  const totalVolumeUsd = records.reduce((s, r) => s + r.amountUsd, 0);
  return { tenantId, totalPayouts, successRate, avgProcessingMs, totalVolumeUsd };
}

export function getDisputeAnalytics(tenantId: string): DisputeAnalytics {
  const records = DISPUTES.filter((d) => d.tenantId === tenantId);
  const totalDisputes = records.length;
  const autoResolvedRate = totalDisputes > 0
    ? records.filter((d) => d.autoResolved).length / totalDisputes
    : 0;

  const resolved = records.filter((d) => d.resolvedMs !== undefined);
  const avgResolutionMs = resolved.length > 0
    ? resolved.reduce((s, d) => s + (d.resolvedMs ?? 0), 0) / resolved.length
    : 0;

  const decided = records.filter((d) => d.outcome === "won" || d.outcome === "lost" || d.outcome === "settled");
  const winRate = decided.length > 0
    ? records.filter((d) => d.outcome === "won").length / decided.length
    : 0;

  const totalValueUsd = records.reduce((s, d) => s + d.amountUsd, 0);
  return { tenantId, totalDisputes, autoResolvedRate, avgResolutionMs, winRate, totalValueUsd };
}

export function getPlatformDisputeRate(): number {
  const totalPayouts = PAYOUTS.length;
  if (totalPayouts === 0) return 0;
  return DISPUTES.length / totalPayouts;
}
