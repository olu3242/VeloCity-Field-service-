// Relationship Analytics & Predictive Intelligence
// CLV, NPS, reward ROI, churn risk, provider excellence trends, referral effectiveness.
// Snapshots stored in-memory; feeds dispatch optimization and commercial strategy.

import { getRecognitionSummary, getTopProviders } from "./recognition-engine";
import { getWalletStats } from "./reward-wallet";
import { getLoyaltyStats } from "./loyalty-engine";
import { getReferralStats } from "./referral-engine";
import { getCommunityStats } from "./community-impact";

export interface RelationshipAnalyticsSnapshot {
  tenantId: string;
  // Customer metrics
  avgClvUsd: number;              // Customer Lifetime Value
  customerAdvocacyIndex: number;  // 0–100
  nps: number;                    // Net Promoter Score approx -100 to 100
  membershipRetentionRate: number; // 0–1
  referralConversionRate: number;  // 0–1
  // Provider metrics
  avgProviderLtvUsd: number;       // Provider Lifetime Value
  rewardConversionRate: number;    // % of jobs that generate a reward
  avgRewardPerJobUsd: number;
  // Platform metrics
  rewardROI: number;               // revenue influenced / rewards issued
  loyaltyParticipationRate: number;
  communityEngagementScore: number; // 0–100
  calculatedAt: string;
}

export interface ChurnRiskSegment {
  segment: "high_risk" | "medium_risk" | "low_risk";
  estimatedCount: number;
  primarySignal: string;
  recommendedAction: string;
}

export interface ChurnRiskReport {
  tenantId: string;
  segments: ChurnRiskSegment[];
  overallChurnRiskPct: number;
  generatedAt: string;
}

export interface ProviderExcellenceTrend {
  tenantId: string;
  topProviderIds: string[];
  avgTrustScore: number;
  avgRecognitionScore: number;
  preferredProviderCount: number;
  newBadgesThisPeriod: number;
  coachingCandidates: number;
  recordedAt: string;
}

const SNAPSHOTS: RelationshipAnalyticsSnapshot[] = [];
const CHURN_REPORTS: ChurnRiskReport[] = [];
const EXCELLENCE_TRENDS: ProviderExcellenceTrend[] = [];
const SNAPSHOT_CAP = 500;
const REPORT_CAP = 100;
const TREND_CAP = 200;

export function computeAndRecordSnapshot(tenantId: string): RelationshipAnalyticsSnapshot {
  const recognition = getRecognitionSummary(tenantId);
  const walletStats = getWalletStats(tenantId);
  const loyaltyStats = getLoyaltyStats(tenantId);
  const referralStats = getReferralStats(tenantId);
  const communityStats = getCommunityStats(tenantId);

  // CLV approximation from loyalty lifetime points (points ≈ $0.01 each) × booking frequency signal
  const avgClvUsd = loyaltyStats.totalAccounts
    ? Math.round(loyaltyStats.avgPointsPerAccount * 0.05 * 100) / 100
    : 0;

  // NPS approximation from average platform rating: rating 4.5+ → strong promoter
  const rawNps = recognition.avgPlatformRating >= 4.5 ? 60
    : recognition.avgPlatformRating >= 4.0 ? 30
    : recognition.avgPlatformRating >= 3.5 ? 0
    : -20;
  const nps = Math.round(rawNps + (recognition.rewardConversionRate * 20));

  // Customer advocacy: blend of rating, reward conversion, referral conversion
  const customerAdvocacyIndex = Math.min(100, Math.round(
    recognition.avgPlatformRating * 15 +
    recognition.rewardConversionRate * 20 +
    referralStats.conversionRate * 15
  ));

  // Provider LTV from wallet total rewards / provider count
  const avgProviderLtvUsd = walletStats.providerCount
    ? Math.round(walletStats.totalRewardsIssuedUsd / walletStats.providerCount * 100) / 100
    : 0;

  // Reward ROI: assume each reward-earning job generates 3× reward value in repeat revenue
  const rewardROI = recognition.totalRewardAmountUsd > 0
    ? Math.round((recognition.totalRewardAmountUsd * 3) / recognition.totalRewardAmountUsd * 100) / 100
    : 0;

  // Loyalty participation
  const loyaltyParticipationRate = recognition.totalProvidersRecognized > 0
    ? Math.min(1, Math.round(loyaltyStats.totalAccounts / Math.max(1, recognition.totalReviews) * 100) / 100)
    : 0;

  // Community engagement 0–100
  const communityEngagementScore = Math.min(100, Math.round(
    communityStats.uniqueContributors * 2 +
    communityStats.totalJobsCompleted * 0.5 +
    communityStats.activePrograms * 5
  ));

  const snapshot: RelationshipAnalyticsSnapshot = {
    tenantId,
    avgClvUsd,
    customerAdvocacyIndex,
    nps,
    membershipRetentionRate: 0.85, // placeholder until membership engine feeds real data
    referralConversionRate: referralStats.conversionRate,
    avgProviderLtvUsd,
    rewardConversionRate: recognition.rewardConversionRate,
    avgRewardPerJobUsd: walletStats.providerCount && recognition.totalReviews
      ? Math.round(recognition.totalRewardAmountUsd / recognition.totalReviews * 100) / 100
      : 0,
    rewardROI,
    loyaltyParticipationRate,
    communityEngagementScore,
    calculatedAt: new Date().toISOString(),
  };

  if (SNAPSHOTS.length >= SNAPSHOT_CAP) SNAPSHOTS.shift();
  SNAPSHOTS.push(snapshot);
  return snapshot;
}

export function getLatestSnapshot(tenantId: string): RelationshipAnalyticsSnapshot | null {
  return [...SNAPSHOTS].reverse().find(s => s.tenantId === tenantId) ?? null;
}

export function getSnapshotTrend(tenantId: string, limit = 10): RelationshipAnalyticsSnapshot[] {
  return SNAPSHOTS.filter(s => s.tenantId === tenantId).slice(-limit).reverse();
}

export function computeChurnRisk(tenantId: string): ChurnRiskReport {
  const loyalty = getLoyaltyStats(tenantId);
  const recognition = getRecognitionSummary(tenantId);

  // Heuristic segmentation
  const lowEngagement = Math.round(loyalty.totalAccounts * 0.15);
  const mediumRisk = Math.round(loyalty.totalAccounts * 0.25);
  const lowRisk = loyalty.totalAccounts - lowEngagement - mediumRisk;
  const overallRisk = loyalty.totalAccounts
    ? Math.round((lowEngagement / loyalty.totalAccounts) * 100) / 100
    : 0;

  const segments: ChurnRiskSegment[] = [
    {
      segment: "high_risk",
      estimatedCount: lowEngagement,
      primarySignal: "no loyalty activity in 60+ days",
      recommendedAction: "Send personalized win-back campaign with bonus points offer",
    },
    {
      segment: "medium_risk",
      estimatedCount: mediumRisk,
      primarySignal: "declining booking frequency",
      recommendedAction: "Trigger loyalty milestone notification and priority scheduling offer",
    },
    {
      segment: "low_risk",
      estimatedCount: Math.max(0, lowRisk),
      primarySignal: recognition.avgPlatformRating < 4.0 ? "below-average ratings" : "healthy engagement",
      recommendedAction: recognition.avgPlatformRating < 4.0
        ? "Proactively offer service guarantee and provider upgrade"
        : "Continue relationship nurturing through rewards and recognition",
    },
  ];

  const report: ChurnRiskReport = {
    tenantId,
    segments,
    overallChurnRiskPct: Math.round(overallRisk * 100),
    generatedAt: new Date().toISOString(),
  };

  if (CHURN_REPORTS.length >= REPORT_CAP) CHURN_REPORTS.shift();
  CHURN_REPORTS.push(report);
  return report;
}

export function computeProviderExcellenceTrend(tenantId: string): ProviderExcellenceTrend {
  const topProviders = getTopProviders(tenantId, 10);
  const avgTrust = topProviders.length
    ? Math.round(topProviders.reduce((s, p) => s + p.trustScore, 0) / topProviders.length)
    : 0;
  const avgRecognition = topProviders.length
    ? Math.round(topProviders.reduce((s, p) => s + p.recognitionScore, 0) / topProviders.length)
    : 0;

  const trend: ProviderExcellenceTrend = {
    tenantId,
    topProviderIds: topProviders.map(p => p.providerId),
    avgTrustScore: avgTrust,
    avgRecognitionScore: avgRecognition,
    preferredProviderCount: topProviders.filter(p => p.preferredProvider).length,
    newBadgesThisPeriod: topProviders.reduce((s, p) => s + p.badges.length, 0),
    coachingCandidates: topProviders.filter(p => p.coachingFlags.length > 0).length,
    recordedAt: new Date().toISOString(),
  };

  if (EXCELLENCE_TRENDS.length >= TREND_CAP) EXCELLENCE_TRENDS.shift();
  EXCELLENCE_TRENDS.push(trend);
  return trend;
}

export function getProviderExcellenceTrends(tenantId: string, limit = 10): ProviderExcellenceTrend[] {
  return EXCELLENCE_TRENDS.filter(t => t.tenantId === tenantId).slice(-limit).reverse();
}

export function getLatestChurnReport(tenantId: string): ChurnRiskReport | null {
  return [...CHURN_REPORTS].reverse().find(r => r.tenantId === tenantId) ?? null;
}
