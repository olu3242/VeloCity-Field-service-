// Computes evidence-backed provider proficiency per service type.
// Reads only real jobs/reviews/provider_offers data — never assigns a score
// manually. Called by handleRexCompletion on every job_completed/
// customer_confirmed event. Extends provider_service_capabilities; does not
// replace it (see docs/velocity/SKILLS_GRAPH_AUDIT.md).

import { getAdminClient } from "@/lib/supabase/admin";

const TERMINAL_COMPLETED_STATUSES = ["completed", "customer_confirmed"] as const;

const SKILL_TIER_THRESHOLDS = [
  { tier: "expert", minJobs: 25, minRating: 4.5 },
  { tier: "proficient", minJobs: 10, minRating: 4.0 },
  { tier: "competent", minJobs: 3, minRating: 3.5 },
] as const;

type SkillTier = "novice" | "competent" | "proficient" | "expert";

function deriveTier(completedJobs: number, averageRating: number | null): SkillTier {
  for (const threshold of SKILL_TIER_THRESHOLDS) {
    if (completedJobs >= threshold.minJobs && (averageRating ?? 0) >= threshold.minRating) {
      return threshold.tier;
    }
  }
  return "novice";
}

function nextTierFor(tier: SkillTier): SkillTier | null {
  const order: SkillTier[] = ["novice", "competent", "proficient", "expert"];
  const idx = order.indexOf(tier);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

export interface ProviderSkillResult {
  providerId: string;
  serviceTypeId: string;
  proficiencyScore: number;
  skillTier: SkillTier;
  completedJobsCount: number;
  averageRating: number | null;
  cancellationRate: number;
}

/** Recomputes proficiency for one provider × service type from real job/review/offer history. */
export async function computeProviderSkill(
  providerId: string,
  serviceTypeId: string
): Promise<ProviderSkillResult | null> {
  const db = getAdminClient();

  const { data: jobs } = await db
    .from("jobs")
    .select("id, status")
    .eq("provider_id", providerId)
    .eq("service_type_id", serviceTypeId);

  if (!jobs || jobs.length === 0) return null;

  const completedJobs = jobs.filter((j: { status: string }) =>
    TERMINAL_COMPLETED_STATUSES.includes(j.status as (typeof TERMINAL_COMPLETED_STATUSES)[number])
  );
  const completedJobsCount = completedJobs.length;
  const jobIds = completedJobs.map((j: { id: string }) => j.id);

  let averageRating: number | null = null;
  if (jobIds.length > 0) {
    const { data: reviews } = await db
      .from("reviews")
      .select("rating")
      .in("job_id", jobIds);
    if (reviews && reviews.length > 0) {
      const sum = reviews.reduce((acc: number, r: { rating: number }) => acc + r.rating, 0);
      averageRating = Math.round((sum / reviews.length) * 100) / 100;
    }
  }

  const allJobIds = jobs.map((j: { id: string }) => j.id);
  const { data: offers } = await db
    .from("provider_offers")
    .select("rejected_at, accepted_at")
    .eq("provider_id", providerId)
    .in("job_id", allJobIds);

  let cancellationRate = 0;
  if (offers && offers.length > 0) {
    const rejected = offers.filter((o: { rejected_at: string | null }) => o.rejected_at !== null).length;
    cancellationRate = Math.round((rejected / offers.length) * 1000) / 1000;
  }

  const skillTier = deriveTier(completedJobsCount, averageRating);
  // Proficiency score: job-volume signal (capped, weighted 60%) + rating signal (weighted 40%).
  const jobVolumeSignal = Math.min(completedJobsCount / 25, 1) * 60;
  const ratingSignal = ((averageRating ?? 0) / 5) * 40;
  const proficiencyScore = Math.round((jobVolumeSignal + ratingSignal) * 100) / 100;

  const { data: existingSkill } = await db
    .from("provider_skills")
    .select("id")
    .eq("provider_id", providerId)
    .eq("service_type_id", serviceTypeId)
    .maybeSingle();

  const { data: upserted } = await db
    .from("provider_skills")
    .upsert(
      {
        provider_id: providerId,
        service_type_id: serviceTypeId,
        proficiency_score: proficiencyScore,
        skill_tier: skillTier,
        completed_jobs_count: completedJobsCount,
        average_rating: averageRating,
        cancellation_rate: cancellationRate,
        last_computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,service_type_id" }
    )
    .select("id")
    .single();

  const providerSkillId = upserted?.id ?? existingSkill?.id;

  if (providerSkillId) {
    await db.from("provider_skill_evidence").insert({
      provider_skill_id: providerSkillId,
      evidence_type: "completed_job",
      detail: {
        completed_jobs_count: completedJobsCount,
        average_rating: averageRating,
        cancellation_rate: cancellationRate,
        proficiency_score: proficiencyScore,
        skill_tier: skillTier,
      },
    });
  }

  const nextTier = nextTierFor(skillTier);
  const nextThreshold = nextTier
    ? SKILL_TIER_THRESHOLDS.find((t) => t.tier === nextTier)
    : null;

  await db.from("provider_skill_progress").upsert(
    {
      provider_id: providerId,
      service_type_id: serviceTypeId,
      current_tier: skillTier,
      next_tier: nextTier,
      jobs_completed: completedJobsCount,
      jobs_required_for_next: nextThreshold ? Math.max(nextThreshold.minJobs - completedJobsCount, 0) : null,
      rating_required_for_next: nextThreshold?.minRating ?? null,
      gap_summary: nextTier
        ? `${Math.max(nextThreshold!.minJobs - completedJobsCount, 0)} more completed job(s) and a ${nextThreshold!.minRating} average rating needed for ${nextTier}`
        : "Highest tier reached",
      computed_at: new Date().toISOString(),
    },
    { onConflict: "provider_id,service_type_id" }
  );

  return {
    providerId,
    serviceTypeId,
    proficiencyScore,
    skillTier,
    completedJobsCount,
    averageRating,
    cancellationRate,
  };
}
