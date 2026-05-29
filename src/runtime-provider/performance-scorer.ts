/**
 * Calculate a composite trust score in the range [0, 1].
 *
 * Formula:
 *   (avgRating / 5 * 0.4)
 *   + (acceptRate * 0.3)
 *   + (min(completedJobs, 100) / 100 * 0.2)
 *   + ((1 - disputeRate) * 0.1)
 *
 * All inputs are expected in natural units:
 *   avgRating    — 0..5
 *   acceptRate   — 0..1
 *   disputeRate  — 0..1
 */
export function calculateTrustScore(
  completedJobs: number,
  avgRating: number,
  acceptRate: number,
  disputeRate: number
): number {
  const ratingComponent = (Math.min(5, Math.max(0, avgRating)) / 5) * 0.4;
  const acceptComponent = Math.min(1, Math.max(0, acceptRate)) * 0.3;
  const jobsComponent = (Math.min(completedJobs, 100) / 100) * 0.2;
  const disputeComponent = (1 - Math.min(1, Math.max(0, disputeRate))) * 0.1;

  const raw = ratingComponent + acceptComponent + jobsComponent + disputeComponent;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Map a trust score to a named tier.
 *
 *   platinum  >= 0.90
 *   gold      >= 0.75
 *   silver    >= 0.55
 *   bronze     < 0.55
 */
export function scoreToTier(
  score: number
): "bronze" | "silver" | "gold" | "platinum" {
  if (score >= 0.9) return "platinum";
  if (score >= 0.75) return "gold";
  if (score >= 0.55) return "silver";
  return "bronze";
}

const TIER_BENEFITS: Record<string, string[]> = {
  bronze: [
    "Access to standard job listings",
    "Basic analytics dashboard",
  ],
  silver: [
    "Access to standard job listings",
    "Basic analytics dashboard",
    "Priority support queue",
    "5% fee discount",
  ],
  gold: [
    "Access to standard and premium job listings",
    "Advanced analytics dashboard",
    "Priority support queue",
    "10% fee discount",
    "Early access to new features",
  ],
  platinum: [
    "Access to all job listings including VIP accounts",
    "Advanced analytics dashboard",
    "Dedicated account manager",
    "15% fee discount",
    "Early access to new features",
    "Featured provider badge",
  ],
};

/**
 * Return the list of benefit strings associated with a provider tier.
 */
export function getTierBenefits(tier: string): string[] {
  return TIER_BENEFITS[tier] ?? TIER_BENEFITS["bronze"];
}
