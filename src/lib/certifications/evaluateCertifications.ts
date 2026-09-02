// Evaluates a provider's category-level metrics against admin-configured
// provider_certification_requirements thresholds and awards/revokes the
// matching tier. Certifications are computed only — never manually
// assigned — per docs/velocity/SKILLS_GRAPH_AUDIT.md Rule 2.

import { getAdminClient } from "@/lib/supabase/admin";

const TIER_ORDER = ["bronze", "silver", "gold", "elite"] as const;
type CertTier = (typeof TIER_ORDER)[number];

export interface CertificationResult {
  providerId: string;
  category: string;
  awardedTier: CertTier | null;
  previousTier: CertTier | null;
}

/** Recomputes and awards/revokes a provider's certification tier for one category from real metrics. */
export async function evaluateProviderCertification(
  providerId: string,
  category: string
): Promise<CertificationResult> {
  const db = getAdminClient();

  const { data: provider } = await db
    .from("providers")
    .select("trust_score, cancellation_rate")
    .eq("id", providerId)
    .single();

  const { data: jobs } = await db
    .from("jobs")
    .select("id")
    .eq("provider_id", providerId)
    .eq("category", category)
    .in("status", ["completed", "customer_confirmed"]);

  const completedJobsCount = jobs?.length ?? 0;
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);

  let averageRating: number | null = null;
  if (jobIds.length > 0) {
    const { data: reviews } = await db.from("reviews").select("rating").in("job_id", jobIds);
    if (reviews && reviews.length > 0) {
      averageRating =
        reviews.reduce((acc: number, r: { rating: number }) => acc + r.rating, 0) / reviews.length;
    }
  }

  const { data: requirements } = await db
    .from("provider_certification_requirements")
    .select("tier, min_completed_jobs, min_average_rating, min_trust_score, max_cancellation_rate")
    .eq("category", category);

  const trustScore = provider?.trust_score ?? 0;
  const cancellationRate = provider?.cancellation_rate ?? 0;

  let awardedTier: CertTier | null = null;
  const evidenceRows: {
    metric: string;
    value: number | null;
    threshold: number;
    passed: boolean;
  }[] = [];

  for (const tier of TIER_ORDER) {
    const req = requirements?.find((r: { tier: string }) => r.tier === tier);
    if (!req) continue;

    const jobsPassed = completedJobsCount >= req.min_completed_jobs;
    const ratingPassed = (averageRating ?? 0) >= req.min_average_rating;
    const trustPassed = trustScore >= req.min_trust_score;
    const cancellationPassed = cancellationRate <= req.max_cancellation_rate;
    const tierPassed = jobsPassed && ratingPassed && trustPassed && cancellationPassed;

    evidenceRows.push(
      { metric: `${tier}_completed_jobs`, value: completedJobsCount, threshold: req.min_completed_jobs, passed: jobsPassed },
      { metric: `${tier}_average_rating`, value: averageRating, threshold: req.min_average_rating, passed: ratingPassed },
      { metric: `${tier}_trust_score`, value: trustScore, threshold: req.min_trust_score, passed: trustPassed },
      { metric: `${tier}_cancellation_rate`, value: cancellationRate, threshold: req.max_cancellation_rate, passed: cancellationPassed }
    );

    if (tierPassed) awardedTier = tier;
  }

  const { data: existing } = await db
    .from("provider_certifications")
    .select("id, tier, is_active")
    .eq("provider_id", providerId)
    .eq("category", category)
    .maybeSingle();

  const previousTier = (existing?.is_active ? existing.tier : null) as CertTier | null;

  let certificationId: string | undefined = existing?.id;

  if (awardedTier) {
    const { data: upserted } = await db
      .from("provider_certifications")
      .upsert(
        {
          provider_id: providerId,
          category,
          tier: awardedTier,
          is_active: true,
          awarded_at: new Date().toISOString(),
          revoked_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,category" }
      )
      .select("id")
      .single();
    certificationId = upserted?.id ?? certificationId;
  } else if (existing?.is_active) {
    await db
      .from("provider_certifications")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  if (certificationId) {
    await db.from("provider_certification_evidence").insert(
      evidenceRows.map((row) => ({
        provider_certification_id: certificationId,
        metric: row.metric,
        value: row.value,
        threshold: row.threshold,
        passed: row.passed,
      }))
    );
  }

  return { providerId, category, awardedTier, previousTier };
}
