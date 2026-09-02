// Relationship Economy & Loyalty Engine (RELE) — Engine 12 customer side.
// Points earning, tier progression, redemption catalog, and upgrade recommendations.

export type LoyaltyEventType =
  | "first_booking" | "repeat_booking" | "annual_loyalty" | "membership_renewal"
  | "review_submitted" | "referral_made" | "early_payment" | "commercial_account";

export type RedemptionType =
  | "discount" | "service_credit" | "membership_upgrade" | "priority_scheduling"
  | "emergency_credit" | "marketplace_offer" | "partner_reward";

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
  diamond: 15000,
};

const DEFAULT_POINTS_MAP: Record<LoyaltyEventType, number> = {
  first_booking: 200,
  repeat_booking: 50,
  annual_loyalty: 500,
  membership_renewal: 300,
  review_submitted: 25,
  referral_made: 150,
  early_payment: 30,
  commercial_account: 1000,
};

export interface LoyaltyAccount {
  customerId: string;
  tenantId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  totalRedemptions: number;
  totalPointsRedeemed: number;
  memberSince: string;
  lastActivityAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  eventType: LoyaltyEventType;
  pointsEarned: number;
  description: string;
  jobId?: string;
  referralId?: string;
  createdAt: string;
}

export interface RedemptionRecord {
  id: string;
  tenantId: string;
  customerId: string;
  type: RedemptionType;
  pointsRedeemed: number;
  valueUsd: number;
  description: string;
  redeemedAt: string;
}

export interface UpgradeRecommendation {
  customerId: string;
  currentTier: LoyaltyTier;
  nextTier: LoyaltyTier;
  pointsToNextTier: number;
  recommendedAction: string;
}

const ACCOUNTS = new Map<string, LoyaltyAccount>(); // `tenantId:customerId`
const TRANSACTIONS: LoyaltyTransaction[] = [];
const REDEMPTIONS: RedemptionRecord[] = [];
const TX_CAP = 3000;
const RED_CAP = 1000;

function aKey(tenantId: string, customerId: string): string {
  return `${tenantId}:${customerId}`;
}

function computeTier(lifetime: number): LoyaltyTier {
  if (lifetime >= TIER_THRESHOLDS.diamond) return "diamond";
  if (lifetime >= TIER_THRESHOLDS.platinum) return "platinum";
  if (lifetime >= TIER_THRESHOLDS.gold) return "gold";
  if (lifetime >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

function ensureAccount(tenantId: string, customerId: string): LoyaltyAccount {
  const key = aKey(tenantId, customerId);
  let acc = ACCOUNTS.get(key);
  if (!acc) {
    const now = new Date().toISOString();
    acc = {
      customerId, tenantId, pointsBalance: 0, lifetimePoints: 0,
      tier: "bronze", totalRedemptions: 0, totalPointsRedeemed: 0,
      memberSince: now, lastActivityAt: now,
    };
    ACCOUNTS.set(key, acc);
  }
  return acc;
}

export function awardPoints(params: {
  tenantId: string;
  customerId: string;
  eventType: LoyaltyEventType;
  pointsOverride?: number;
  jobId?: string;
  referralId?: string;
  description?: string;
}): LoyaltyTransaction {
  const points = params.pointsOverride ?? DEFAULT_POINTS_MAP[params.eventType];
  const acc = ensureAccount(params.tenantId, params.customerId);

  acc.pointsBalance += points;
  acc.lifetimePoints += points;
  acc.tier = computeTier(acc.lifetimePoints);
  acc.lastActivityAt = new Date().toISOString();

  const tx: LoyaltyTransaction = {
    id: `loy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    customerId: params.customerId,
    eventType: params.eventType,
    pointsEarned: points,
    description: params.description ?? `Points awarded for ${params.eventType.replace(/_/g, " ")}`,
    jobId: params.jobId,
    referralId: params.referralId,
    createdAt: new Date().toISOString(),
  };

  if (TRANSACTIONS.length >= TX_CAP) TRANSACTIONS.shift();
  TRANSACTIONS.push(tx);
  return tx;
}

export function redeemPoints(params: {
  tenantId: string;
  customerId: string;
  type: RedemptionType;
  pointsToRedeem: number;
  valueUsd: number;
  description: string;
}): RedemptionRecord | null {
  const acc = ensureAccount(params.tenantId, params.customerId);
  if (acc.pointsBalance < params.pointsToRedeem) return null;

  acc.pointsBalance -= params.pointsToRedeem;
  acc.totalPointsRedeemed += params.pointsToRedeem;
  acc.totalRedemptions++;
  acc.lastActivityAt = new Date().toISOString();

  const record: RedemptionRecord = {
    id: `red_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    customerId: params.customerId,
    type: params.type,
    pointsRedeemed: params.pointsToRedeem,
    valueUsd: params.valueUsd,
    description: params.description,
    redeemedAt: new Date().toISOString(),
  };

  if (REDEMPTIONS.length >= RED_CAP) REDEMPTIONS.shift();
  REDEMPTIONS.push(record);
  return record;
}

export function getLoyaltyAccount(customerId: string, tenantId: string): LoyaltyAccount {
  return ensureAccount(tenantId, customerId);
}

export function getLoyaltyTransactions(customerId: string, tenantId: string, limit = 50): LoyaltyTransaction[] {
  return TRANSACTIONS.filter(t => t.tenantId === tenantId && t.customerId === customerId).slice(-limit).reverse();
}

export function getRedemptions(customerId: string, tenantId: string, limit = 20): RedemptionRecord[] {
  return REDEMPTIONS.filter(r => r.tenantId === tenantId && r.customerId === customerId).slice(-limit).reverse();
}

export function checkUpgrade(customerId: string, tenantId: string): UpgradeRecommendation | null {
  const acc = ensureAccount(tenantId, customerId);
  const tierOrder: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
  const currentIndex = tierOrder.indexOf(acc.tier);
  if (currentIndex >= tierOrder.length - 1) return null;

  const nextTier = tierOrder[currentIndex + 1];
  const pointsNeeded = TIER_THRESHOLDS[nextTier] - acc.lifetimePoints;

  const actions: Record<LoyaltyTier, string> = {
    silver: "Book 2-3 more services to unlock Silver tier",
    gold: "Refer a friend and complete 5 more services to reach Gold",
    platinum: "Renew membership and book 10 more services to reach Platinum",
    diamond: "Maintain regular bookings over 12 months to achieve Diamond status",
    bronze: "",
  };

  return {
    customerId, currentTier: acc.tier, nextTier,
    pointsToNextTier: Math.max(0, pointsNeeded),
    recommendedAction: actions[nextTier],
  };
}

export function getLoyaltyStats(tenantId: string) {
  const accounts = Array.from(ACCOUNTS.values()).filter(a => a.tenantId === tenantId);
  const byTier: Record<LoyaltyTier, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0 };
  for (const a of accounts) byTier[a.tier]++;

  const totalPoints = accounts.reduce((s, a) => s + a.lifetimePoints, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.pointsBalance, 0);
  const redemptions = REDEMPTIONS.filter(r => r.tenantId === tenantId);
  const totalRedemptionValue = Math.round(redemptions.reduce((s, r) => s + r.valueUsd, 0) * 100) / 100;

  return {
    totalAccounts: accounts.length,
    byTier,
    totalLifetimePoints: totalPoints,
    totalActiveBalance: totalBalance,
    totalRedemptions: redemptions.length,
    totalRedemptionValueUsd: totalRedemptionValue,
    avgPointsPerAccount: accounts.length ? Math.round(totalPoints / accounts.length) : 0,
  };
}
