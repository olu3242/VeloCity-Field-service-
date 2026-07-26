// Referral Economy — full lifecycle from invite through reward settlement.
// Supports referrals from customers, providers, franchisees, commercial clients, partners.

export type ReferralSourceType = "customer" | "provider" | "franchisee" | "commercial_client" | "partner";

export type ReferralStatus =
  | "invited" | "registered" | "verified" | "first_booking" | "completed" | "rewarded" | "expired";

const STATUS_ORDER: ReferralStatus[] = [
  "invited", "registered", "verified", "first_booking", "completed", "rewarded",
];

export interface ReferralRecord {
  id: string;
  tenantId: string;
  referrerId: string;
  referrerType: ReferralSourceType;
  refereeId?: string;
  refereeEmail?: string;
  status: ReferralStatus;
  rewardAmount?: number;
  rewardIssuedAt?: string;
  invitedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface TopReferrer {
  referrerId: string;
  referrerType: ReferralSourceType;
  totalReferrals: number;
  completedReferrals: number;
  totalRewardsUsd: number;
  conversionRate: number;
}

const REFERRALS: ReferralRecord[] = [];
const REFERRAL_CAP = 2000;

export function createReferral(params: {
  tenantId: string;
  referrerId: string;
  referrerType: ReferralSourceType;
  refereeEmail?: string;
  refereeId?: string;
}): ReferralRecord {
  const record: ReferralRecord = {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    referrerId: params.referrerId,
    referrerType: params.referrerType,
    refereeId: params.refereeId,
    refereeEmail: params.refereeEmail,
    status: "invited",
    invitedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (REFERRALS.length >= REFERRAL_CAP) REFERRALS.shift();
  REFERRALS.push(record);
  return record;
}

export function advanceReferralStatus(
  id: string,
  status: ReferralStatus,
  refereeId?: string,
): ReferralRecord | null {
  const record = REFERRALS.find(r => r.id === id);
  if (!record || record.status === "expired" || record.status === "rewarded") return null;

  const currentIndex = STATUS_ORDER.indexOf(record.status);
  const nextIndex = STATUS_ORDER.indexOf(status);
  if (nextIndex <= currentIndex) return null;

  record.status = status;
  if (refereeId) record.refereeId = refereeId;
  if (status === "completed") record.completedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  return record;
}

export function expireReferral(id: string): ReferralRecord | null {
  const record = REFERRALS.find(r => r.id === id);
  if (!record || record.status === "rewarded" || record.status === "completed") return null;
  record.status = "expired";
  record.updatedAt = new Date().toISOString();
  return record;
}

export function issueReferralReward(id: string, amount: number): ReferralRecord | null {
  const record = REFERRALS.find(r => r.id === id);
  if (!record || record.status !== "completed") return null;
  record.rewardAmount = amount;
  record.rewardIssuedAt = new Date().toISOString();
  record.status = "rewarded";
  record.updatedAt = new Date().toISOString();
  return record;
}

export function getReferralById(id: string): ReferralRecord | null {
  return REFERRALS.find(r => r.id === id) ?? null;
}

export function getReferralsByReferrer(referrerId: string, tenantId: string): ReferralRecord[] {
  return REFERRALS.filter(r => r.tenantId === tenantId && r.referrerId === referrerId).slice().reverse();
}

export function getReferralStats(tenantId: string) {
  const records = REFERRALS.filter(r => r.tenantId === tenantId);
  const byStatus: Record<string, number> = {};
  for (const r of records) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const bySource: Record<string, number> = {};
  for (const r of records) bySource[r.referrerType] = (bySource[r.referrerType] ?? 0) + 1;

  const completed = records.filter(r => r.status === "completed" || r.status === "rewarded");
  const rewarded = records.filter(r => r.status === "rewarded");
  const totalRewardsUsd = Math.round(rewarded.reduce((s, r) => s + (r.rewardAmount ?? 0), 0) * 100) / 100;
  const conversionRate = records.length ? Math.round(completed.length / records.length * 100) / 100 : 0;

  return {
    total: records.length,
    byStatus,
    bySource,
    completedCount: completed.length,
    rewardedCount: rewarded.length,
    totalRewardsUsd,
    conversionRate,
  };
}

export function getTopReferrers(tenantId: string, limit = 10): TopReferrer[] {
  const records = REFERRALS.filter(r => r.tenantId === tenantId);
  const map = new Map<string, { record: ReferralRecord; total: number; completed: number; rewards: number }>();

  for (const r of records) {
    const existing = map.get(r.referrerId);
    if (existing) {
      existing.total++;
      if (r.status === "completed" || r.status === "rewarded") existing.completed++;
      existing.rewards += r.rewardAmount ?? 0;
    } else {
      map.set(r.referrerId, {
        record: r,
        total: 1,
        completed: (r.status === "completed" || r.status === "rewarded") ? 1 : 0,
        rewards: r.rewardAmount ?? 0,
      });
    }
  }

  return Array.from(map.values())
    .map(({ record, total, completed, rewards }) => ({
      referrerId: record.referrerId,
      referrerType: record.referrerType,
      totalReferrals: total,
      completedReferrals: completed,
      totalRewardsUsd: Math.round(rewards * 100) / 100,
      conversionRate: total ? Math.round(completed / total * 100) / 100 : 0,
    }))
    .sort((a, b) => b.completedReferrals - a.completedReferrals)
    .slice(0, limit);
}
