// Recognition, Rewards & Gratuity Engine (RRGE) — Engine 11
// Multi-dimension service reviews, provider badges, reward authorization/settlement,
// and AI recognition scores. Feeds dispatch confidence and career progression.

export type RatingDimension =
  | "professionalism" | "communication" | "timeliness" | "work_quality"
  | "cleanliness" | "problem_resolution" | "courtesy" | "would_recommend";

export type RewardType = "fixed" | "percentage" | "custom";

export type BadgeType =
  | "customer_favorite" | "five_star_professional" | "elite_technician"
  | "community_hero" | "platinum_provider" | "service_excellence"
  | "territory_champion" | "top_rated_this_month";

export interface ServiceReward {
  type: RewardType;
  amount: number;           // final USD amount
  percentage?: number;      // for percentage type
  baseAmount?: number;      // service total for percentage calc
  authorized: boolean;
  authorizedAt?: string;
  settledAt?: string;
}

export interface ServiceReview {
  id: string;
  tenantId: string;
  jobId: string;
  customerId: string;
  providerId: string;
  overallRating: number;                        // 1–5
  dimensions: Record<RatingDimension, number>;  // each 1–5
  wouldRecommend: boolean;
  reward?: ServiceReward;
  submittedAt: string;
}

export interface ProviderBadge {
  id: string;
  tenantId: string;
  providerId: string;
  badgeType: BadgeType;
  awardedAt: string;
  expiresAt?: string;
  jobId?: string;
}

export interface ProviderRecognitionProfile {
  providerId: string;
  tenantId: string;
  totalReviews: number;
  avgOverallRating: number;
  avgDimensions: Record<RatingDimension, number>;
  totalRewards: number;
  totalRewardAmountUsd: number;
  badges: BadgeType[];
  trustScore: number;          // 0–100 AI signal
  dispatchConfidence: number;  // 0–100 AI signal
  recognitionScore: number;    // 0–100 AI signal
  preferredProvider: boolean;
  coachingFlags: string[];
  updatedAt: string;
}

const REVIEWS = new Map<string, ServiceReview>();        // id → review
const PROVIDER_REVIEW_INDEX = new Map<string, string[]>(); // `tenantId:providerId` → reviewIds
const BADGES = new Map<string, ProviderBadge>();
const PROVIDER_BADGE_INDEX = new Map<string, string[]>(); // `tenantId:providerId` → badgeIds
const PROFILES = new Map<string, ProviderRecognitionProfile>(); // `tenantId:providerId` → profile

const REVIEW_CAP = 2000;
const BADGE_CAP = 1000;

const ALL_DIMENSIONS: RatingDimension[] = [
  "professionalism", "communication", "timeliness", "work_quality",
  "cleanliness", "problem_resolution", "courtesy", "would_recommend",
];

function pKey(tenantId: string, providerId: string): string {
  return `${tenantId}:${providerId}`;
}

function autoAwardBadges(providerId: string, tenantId: string, profile: ProviderRecognitionProfile): void {
  const existing = new Set(profile.badges);
  const now = new Date().toISOString();

  const candidates: { condition: boolean; badge: BadgeType }[] = [
    { condition: profile.avgOverallRating >= 4.8 && profile.totalReviews >= 10, badge: "five_star_professional" },
    { condition: profile.totalRewards >= 20, badge: "customer_favorite" },
    { condition: profile.recognitionScore >= 85, badge: "elite_technician" },
    { condition: profile.totalReviews >= 50 && profile.avgOverallRating >= 4.5, badge: "platinum_provider" },
    { condition: profile.trustScore >= 90, badge: "service_excellence" },
  ];

  for (const { condition, badge } of candidates) {
    if (condition && !existing.has(badge)) {
      const id = `badge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const b: ProviderBadge = { id, tenantId, providerId, badgeType: badge, awardedAt: now };
      if (BADGES.size >= BADGE_CAP) {
        const firstKey = Array.from(BADGES.keys())[0];
        if (firstKey) BADGES.delete(firstKey);
      }
      BADGES.set(id, b);
      const list = PROVIDER_BADGE_INDEX.get(pKey(tenantId, providerId)) ?? [];
      list.push(id);
      PROVIDER_BADGE_INDEX.set(pKey(tenantId, providerId), list);
    }
  }
}

function recomputeProfile(providerId: string, tenantId: string): ProviderRecognitionProfile {
  const key = pKey(tenantId, providerId);
  const reviewIds = PROVIDER_REVIEW_INDEX.get(key) ?? [];
  const reviews = reviewIds
    .map(id => REVIEWS.get(id))
    .filter((r): r is ServiceReview => r !== undefined && r.tenantId === tenantId);

  const n = reviews.length;
  const avgOverall = n ? Math.round((reviews.reduce((s, r) => s + r.overallRating, 0) / n) * 100) / 100 : 0;

  const avgDims = {} as Record<RatingDimension, number>;
  for (const dim of ALL_DIMENSIONS) {
    avgDims[dim] = n ? Math.round((reviews.reduce((s, r) => s + (r.dimensions[dim] ?? 3), 0) / n) * 100) / 100 : 3;
  }

  const rewarded = reviews.filter(r => r.reward?.authorized);
  const totalRewards = rewarded.length;
  const totalRewardAmountUsd = Math.round(rewarded.reduce((s, r) => s + (r.reward?.amount ?? 0), 0) * 100) / 100;

  const badgeIds = PROVIDER_BADGE_INDEX.get(key) ?? [];
  const badges: BadgeType[] = Array.from(new Set(
    badgeIds.map(id => BADGES.get(id)).filter((b): b is ProviderBadge => b !== undefined && b.tenantId === tenantId).map(b => b.badgeType)
  ));

  const rewardRatio = n ? totalRewards / n : 0;
  const trustScore = Math.min(100, Math.round(avgOverall * 16 + rewardRatio * 15 + Math.min(badges.length, 5) * 1.5));
  const recognitionScore = Math.min(100, Math.round(avgOverall * 14 + badges.length * 4 + (totalRewardAmountUsd / Math.max(1, n)) * 0.8));
  const dispatchConfidence = Math.min(100, Math.round((trustScore * 0.6 + recognitionScore * 0.4)));
  const preferredProvider = trustScore >= 80 && avgOverall >= 4.5 && n >= 5;

  const coachingFlags: string[] = [];
  if (avgDims.communication < 3.5) coachingFlags.push("communication_improvement");
  if (avgDims.timeliness < 3.5) coachingFlags.push("punctuality_coaching");
  if (avgDims.cleanliness < 3.5) coachingFlags.push("cleanliness_standards");
  if (rewardRatio < 0.1 && n >= 10) coachingFlags.push("low_reward_rate");

  const profile: ProviderRecognitionProfile = {
    providerId, tenantId, totalReviews: n, avgOverallRating: avgOverall,
    avgDimensions: avgDims, totalRewards, totalRewardAmountUsd,
    badges, trustScore, dispatchConfidence, recognitionScore,
    preferredProvider, coachingFlags, updatedAt: new Date().toISOString(),
  };
  PROFILES.set(key, profile);
  autoAwardBadges(providerId, tenantId, profile);
  return profile;
}

export function submitReview(params: {
  jobId: string;
  tenantId: string;
  customerId: string;
  providerId: string;
  overallRating: number;
  dimensions: Record<RatingDimension, number>;
  wouldRecommend: boolean;
  reward?: ServiceReward;
}): ServiceReview {
  const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const review: ServiceReview = { id, ...params, submittedAt: new Date().toISOString() };

  if (REVIEWS.size >= REVIEW_CAP) {
    const firstKey = Array.from(REVIEWS.keys())[0];
    if (firstKey) REVIEWS.delete(firstKey);
  }
  REVIEWS.set(id, review);

  const key = pKey(params.tenantId, params.providerId);
  const list = PROVIDER_REVIEW_INDEX.get(key) ?? [];
  list.push(id);
  PROVIDER_REVIEW_INDEX.set(key, list);

  recomputeProfile(params.providerId, params.tenantId);
  return review;
}

export function authorizeReward(reviewId: string): ServiceReview | null {
  const review = REVIEWS.get(reviewId);
  if (!review || !review.reward) return null;
  review.reward.authorized = true;
  review.reward.authorizedAt = new Date().toISOString();
  recomputeProfile(review.providerId, review.tenantId);
  return review;
}

export function settleReward(reviewId: string): ServiceReview | null {
  const review = REVIEWS.get(reviewId);
  if (!review || !review.reward?.authorized) return null;
  review.reward.settledAt = new Date().toISOString();
  recomputeProfile(review.providerId, review.tenantId);
  return review;
}

export function awardBadge(params: {
  tenantId: string;
  providerId: string;
  badgeType: BadgeType;
  jobId?: string;
  expiresAt?: string;
}): ProviderBadge {
  const id = `badge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const badge: ProviderBadge = { id, ...params, awardedAt: new Date().toISOString() };

  if (BADGES.size >= BADGE_CAP) {
    const firstKey = Array.from(BADGES.keys())[0];
    if (firstKey) BADGES.delete(firstKey);
  }
  BADGES.set(id, badge);

  const key = pKey(params.tenantId, params.providerId);
  const list = PROVIDER_BADGE_INDEX.get(key) ?? [];
  list.push(id);
  PROVIDER_BADGE_INDEX.set(key, list);

  recomputeProfile(params.providerId, params.tenantId);
  return badge;
}

export function getProviderProfile(providerId: string, tenantId: string): ProviderRecognitionProfile {
  return PROFILES.get(pKey(tenantId, providerId)) ?? recomputeProfile(providerId, tenantId);
}

export function getReviewById(id: string): ServiceReview | null {
  return REVIEWS.get(id) ?? null;
}

export function getProviderReviews(providerId: string, tenantId: string, limit = 50): ServiceReview[] {
  const ids = PROVIDER_REVIEW_INDEX.get(pKey(tenantId, providerId)) ?? [];
  return ids.slice(-limit).map(id => REVIEWS.get(id)).filter((r): r is ServiceReview => r !== undefined).reverse();
}

export function getProviderBadges(providerId: string, tenantId: string): ProviderBadge[] {
  const ids = PROVIDER_BADGE_INDEX.get(pKey(tenantId, providerId)) ?? [];
  return ids.map(id => BADGES.get(id)).filter((b): b is ProviderBadge => b !== undefined);
}

export function getTopProviders(tenantId: string, limit = 20): ProviderRecognitionProfile[] {
  return Array.from(PROFILES.values())
    .filter(p => p.tenantId === tenantId)
    .sort((a, b) => b.recognitionScore - a.recognitionScore)
    .slice(0, limit);
}

export function getRecognitionSummary(tenantId?: string) {
  const profiles = Array.from(PROFILES.values()).filter(p => !tenantId || p.tenantId === tenantId);
  const reviews = Array.from(REVIEWS.values()).filter(r => !tenantId || r.tenantId === tenantId);
  const badges = Array.from(BADGES.values()).filter(b => !tenantId || b.tenantId === tenantId);
  const avg = profiles.length ? profiles.reduce((s, p) => s + p.avgOverallRating, 0) / profiles.length : 0;
  const rewardedReviews = reviews.filter(r => r.reward?.authorized);
  return {
    totalReviews: reviews.length,
    totalBadgesAwarded: badges.length,
    totalProvidersRecognized: profiles.length,
    avgPlatformRating: Math.round(avg * 100) / 100,
    rewardConversionRate: reviews.length ? Math.round(rewardedReviews.length / reviews.length * 100) / 100 : 0,
    preferredProviderCount: profiles.filter(p => p.preferredProvider).length,
    totalRewardAmountUsd: Math.round(rewardedReviews.reduce((s, r) => s + (r.reward?.amount ?? 0), 0) * 100) / 100,
  };
}
