// Provider Reward Wallet — credits rewards, tips, bonuses, incentives.
// Tracks lifetime, weekly, and monthly reward earnings with payout policy support.

export type WalletTransactionType = "reward" | "tip" | "bonus" | "incentive" | "payout" | "adjustment";

export type PayoutPolicy = "immediate" | "weekly" | "biweekly" | "monthly" | "manual";

export interface WalletTransaction {
  id: string;
  tenantId: string;
  providerId: string;
  type: WalletTransactionType;
  amount: number;       // positive = credit, negative = debit
  balanceAfter: number;
  jobId?: string;
  reviewId?: string;
  description: string;
  createdAt: string;
}

export interface ProviderWallet {
  providerId: string;
  tenantId: string;
  balance: number;
  lifetimeEarned: number;     // total credits ever
  lifetimeRewards: number;    // reward + tip credits
  weeklyRewards: number;      // rolling 7 days
  monthlyRewards: number;     // rolling 30 days
  avgRewardPerJob: number;
  largestReward: number;
  rewardCount: number;
  totalJobs: number;          // denominator for avgRewardPerJob
  rewardToJobRatio: number;   // rewardCount / totalJobs
  payoutPolicy: PayoutPolicy;
  lastUpdatedAt: string;
}

const WALLETS = new Map<string, ProviderWallet>();   // `tenantId:providerId` → wallet
const TRANSACTIONS: WalletTransaction[] = [];
const TRANSACTION_CAP = 5000;

const REWARD_TYPES = new Set<WalletTransactionType>(["reward", "tip", "bonus", "incentive"]);

function wKey(tenantId: string, providerId: string): string {
  return `${tenantId}:${providerId}`;
}

function ensureWallet(tenantId: string, providerId: string): ProviderWallet {
  const key = wKey(tenantId, providerId);
  let wallet = WALLETS.get(key);
  if (!wallet) {
    wallet = {
      providerId, tenantId, balance: 0, lifetimeEarned: 0, lifetimeRewards: 0,
      weeklyRewards: 0, monthlyRewards: 0, avgRewardPerJob: 0, largestReward: 0,
      rewardCount: 0, totalJobs: 0, rewardToJobRatio: 0,
      payoutPolicy: "weekly", lastUpdatedAt: new Date().toISOString(),
    };
    WALLETS.set(key, wallet);
  }
  return wallet;
}

function refreshRollingTotals(wallet: ProviderWallet): void {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const provTx = TRANSACTIONS.filter(t => t.tenantId === wallet.tenantId && t.providerId === wallet.providerId && REWARD_TYPES.has(t.type) && t.amount > 0);
  wallet.weeklyRewards = Math.round(provTx.filter(t => t.createdAt >= weekAgo).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  wallet.monthlyRewards = Math.round(provTx.filter(t => t.createdAt >= monthAgo).reduce((s, t) => s + t.amount, 0) * 100) / 100;
}

export function creditWallet(params: {
  tenantId: string;
  providerId: string;
  type: WalletTransactionType;
  amount: number;
  jobId?: string;
  reviewId?: string;
  description: string;
  totalJobsIncrement?: boolean;
}): WalletTransaction {
  if (params.amount <= 0) throw new Error("creditWallet amount must be positive");
  const wallet = ensureWallet(params.tenantId, params.providerId);

  wallet.balance = Math.round((wallet.balance + params.amount) * 100) / 100;
  wallet.lifetimeEarned = Math.round((wallet.lifetimeEarned + params.amount) * 100) / 100;

  if (REWARD_TYPES.has(params.type)) {
    wallet.lifetimeRewards = Math.round((wallet.lifetimeRewards + params.amount) * 100) / 100;
    wallet.rewardCount++;
    if (params.amount > wallet.largestReward) wallet.largestReward = params.amount;
  }
  if (params.totalJobsIncrement) {
    wallet.totalJobs++;
  }
  wallet.rewardToJobRatio = wallet.totalJobs ? Math.round(wallet.rewardCount / wallet.totalJobs * 100) / 100 : 0;
  wallet.avgRewardPerJob = wallet.totalJobs && wallet.rewardCount
    ? Math.round(wallet.lifetimeRewards / wallet.rewardCount * 100) / 100
    : 0;
  wallet.lastUpdatedAt = new Date().toISOString();

  const tx: WalletTransaction = {
    id: `wtx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    providerId: params.providerId,
    type: params.type,
    amount: params.amount,
    balanceAfter: wallet.balance,
    jobId: params.jobId,
    reviewId: params.reviewId,
    description: params.description,
    createdAt: new Date().toISOString(),
  };

  if (TRANSACTIONS.length >= TRANSACTION_CAP) TRANSACTIONS.shift();
  TRANSACTIONS.push(tx);

  refreshRollingTotals(wallet);
  return tx;
}

export function recordPayout(params: {
  tenantId: string;
  providerId: string;
  amount: number;
  description: string;
}): WalletTransaction {
  if (params.amount <= 0) throw new Error("payout amount must be positive");
  const wallet = ensureWallet(params.tenantId, params.providerId);

  wallet.balance = Math.round((wallet.balance - params.amount) * 100) / 100;
  wallet.lastUpdatedAt = new Date().toISOString();

  const tx: WalletTransaction = {
    id: `wtx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    providerId: params.providerId,
    type: "payout",
    amount: -params.amount,
    balanceAfter: wallet.balance,
    description: params.description,
    createdAt: new Date().toISOString(),
  };

  if (TRANSACTIONS.length >= TRANSACTION_CAP) TRANSACTIONS.shift();
  TRANSACTIONS.push(tx);
  return tx;
}

export function setPayoutPolicy(tenantId: string, providerId: string, policy: PayoutPolicy): void {
  const wallet = ensureWallet(tenantId, providerId);
  wallet.payoutPolicy = policy;
  wallet.lastUpdatedAt = new Date().toISOString();
}

export function getWallet(providerId: string, tenantId: string): ProviderWallet {
  return ensureWallet(tenantId, providerId);
}

export function getWalletTransactions(providerId: string, tenantId: string, limit = 50): WalletTransaction[] {
  return TRANSACTIONS
    .filter(t => t.tenantId === tenantId && t.providerId === providerId)
    .slice(-limit)
    .reverse();
}

export function getWalletStats(tenantId: string) {
  const wallets = Array.from(WALLETS.values()).filter(w => w.tenantId === tenantId);
  const tx = TRANSACTIONS.filter(t => t.tenantId === tenantId);
  const totalBalance = Math.round(wallets.reduce((s, w) => s + w.balance, 0) * 100) / 100;
  const totalRewardsIssued = Math.round(wallets.reduce((s, w) => s + w.lifetimeRewards, 0) * 100) / 100;
  const avgRewardPerProvider = wallets.length ? Math.round(totalRewardsIssued / wallets.length * 100) / 100 : 0;
  return {
    providerCount: wallets.length,
    totalBalanceUsd: totalBalance,
    totalRewardsIssuedUsd: totalRewardsIssued,
    avgRewardPerProvider,
    transactionCount: tx.length,
    recentTransactions: tx.slice(-10).reverse(),
  };
}
