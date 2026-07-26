// GET  /api/admin/provider-recognition — recognition summary, top providers, leaderboard
// POST /api/admin/provider-recognition — submit_review | authorize_reward | settle_reward | award_badge | get_profile

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  submitReview, authorizeReward, settleReward, awardBadge,
  getProviderProfile, getReviewById, getProviderReviews, getProviderBadges,
  getTopProviders, getRecognitionSummary,
  type RatingDimension, type RewardType, type BadgeType, type ServiceReward,
} from "@/lib/relationship/recognition-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_REWARD_TYPES: RewardType[] = ["fixed", "percentage", "custom"];
const VALID_BADGE_TYPES: BadgeType[] = [
  "customer_favorite", "five_star_professional", "elite_technician",
  "community_hero", "platinum_provider", "service_excellence",
  "territory_champion", "top_rated_this_month",
];
const ALL_DIMENSIONS: RatingDimension[] = [
  "professionalism", "communication", "timeliness", "work_quality",
  "cleanliness", "problem_resolution", "courtesy", "would_recommend",
];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return { error: "Forbidden", status: 403 as const, profile: null };
  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const topLimit = Math.min(50, parseInt(url.searchParams.get("topLimit") ?? "20", 10));
  const reviewLimit = Math.min(100, parseInt(url.searchParams.get("reviewLimit") ?? "20", 10));

  if (providerId) {
    const profile = getProviderProfile(providerId, tenantId);
    const reviews = getProviderReviews(providerId, tenantId, reviewLimit);
    const badges = getProviderBadges(providerId, tenantId);
    return NextResponse.json({ profile, reviews, badges, generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({
    summary: getRecognitionSummary(tenantId),
    topProviders: getTopProviders(tenantId, topLimit),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "submit_review") {
    const { jobId, customerId, providerId, overallRating, dimensions, wouldRecommend, reward } = body as Record<string, unknown>;
    if (typeof jobId !== "string" || typeof customerId !== "string" || typeof providerId !== "string") {
      return NextResponse.json({ error: "jobId, customerId, and providerId required" }, { status: 400 });
    }
    if (typeof overallRating !== "number" || overallRating < 1 || overallRating > 5) {
      return NextResponse.json({ error: "overallRating must be 1–5" }, { status: 400 });
    }

    // Validate dimensions
    const rawDims = (dimensions && typeof dimensions === "object") ? dimensions as Record<string, unknown> : {};
    const resolvedDims = {} as Record<RatingDimension, number>;
    for (const dim of ALL_DIMENSIONS) {
      const val = rawDims[dim];
      resolvedDims[dim] = typeof val === "number" && val >= 1 && val <= 5 ? val : overallRating;
    }

    let serviceReward: ServiceReward | undefined;
    if (reward && typeof reward === "object") {
      const r = reward as Record<string, unknown>;
      if (VALID_REWARD_TYPES.includes(r.type as RewardType) && typeof r.amount === "number" && r.amount >= 0) {
        serviceReward = {
          type: r.type as RewardType,
          amount: r.amount,
          percentage: typeof r.percentage === "number" ? r.percentage : undefined,
          baseAmount: typeof r.baseAmount === "number" ? r.baseAmount : undefined,
          authorized: r.authorized === true,
        };
      }
    }

    const review = submitReview({
      jobId, tenantId, customerId, providerId,
      overallRating, dimensions: resolvedDims,
      wouldRecommend: wouldRecommend === true,
      reward: serviceReward,
    });
    return NextResponse.json({ action, review, profile: getProviderProfile(providerId, tenantId), success: true }, { status: 201 });
  }

  if (action === "authorize_reward") {
    const { reviewId } = body as Record<string, unknown>;
    if (typeof reviewId !== "string") return NextResponse.json({ error: "reviewId required" }, { status: 400 });
    const review = authorizeReward(reviewId);
    if (!review) return NextResponse.json({ error: "Review not found or no reward attached" }, { status: 422 });
    return NextResponse.json({ action, review, success: true });
  }

  if (action === "settle_reward") {
    const { reviewId } = body as Record<string, unknown>;
    if (typeof reviewId !== "string") return NextResponse.json({ error: "reviewId required" }, { status: 400 });
    const review = settleReward(reviewId);
    if (!review) return NextResponse.json({ error: "Review not found or reward not authorized" }, { status: 422 });
    return NextResponse.json({ action, review, success: true });
  }

  if (action === "award_badge") {
    const { providerId, badgeType, jobId, expiresAt } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    if (!VALID_BADGE_TYPES.includes(badgeType as BadgeType)) return NextResponse.json({ error: `badgeType must be one of: ${VALID_BADGE_TYPES.join(", ")}` }, { status: 400 });
    const badge = awardBadge({
      tenantId, providerId,
      badgeType: badgeType as BadgeType,
      jobId: typeof jobId === "string" ? jobId : undefined,
      expiresAt: typeof expiresAt === "string" ? expiresAt : undefined,
    });
    return NextResponse.json({ action, badge, profile: getProviderProfile(providerId, tenantId), success: true }, { status: 201 });
  }

  if (action === "get_profile") {
    const { providerId } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    const reviewId = (body as Record<string, unknown>).reviewId;
    return NextResponse.json({
      action,
      profile: getProviderProfile(providerId, tenantId),
      badges: getProviderBadges(providerId, tenantId),
      review: typeof reviewId === "string" ? getReviewById(reviewId) : undefined,
      success: true,
    });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'submit_review', 'authorize_reward', 'settle_reward', 'award_badge', or 'get_profile'.` }, { status: 400 });
}
