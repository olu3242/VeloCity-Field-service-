// Provider Quality Intelligence — deterministic, evidence-derived quality
// scoring consumed by QUINN. Reads only real reviews/jobs/disputes/
// provider_skills data; never assigns a score manually (Rule 2).

import { getAdminClient } from "@/lib/supabase/admin";

const NEGATIVE_KEYWORDS = ["late", "rude", "damaged", "incomplete", "no show", "unprofessional", "rescheduled"];

export interface ServiceQualityScore {
  serviceTypeId: string;
  averageRating: number | null;
  completedJobsCount: number;
}

export interface RepeatIssue {
  keyword: string;
  occurrences: number;
}

export interface SentimentTrend {
  recentAverageRating: number | null;
  priorAverageRating: number | null;
  trend: "improving" | "declining" | "stable" | "insufficient_data";
}

export interface QualityRiskAlert {
  severity: "low" | "medium" | "high";
  reason: string;
}

export interface ProviderQualityReport {
  providerId: string;
  providerQualityScore: number;
  serviceQualityScores: ServiceQualityScore[];
  repeatIssues: RepeatIssue[];
  sentimentTrend: SentimentTrend;
  riskAlerts: QualityRiskAlert[];
  remediationPlan: string[];
  certificationImpact: string[];
  trainingRecommendations: string[];
}

export async function assessProviderQuality(providerId: string): Promise<ProviderQualityReport> {
  const db = getAdminClient();

  const { data: provider } = await db
    .from("providers")
    .select("trust_score, cancellation_rate, user_id")
    .eq("id", providerId)
    .single();

  const { data: jobs } = await db.from("jobs").select("id, created_at").eq("provider_id", providerId);
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);

  const { data: reviews } = jobIds.length
    ? await db.from("reviews").select("rating, comment, created_at, job_id").in("job_id", jobIds)
    : { data: [] as Array<{ rating: number; comment: string | null; created_at: string; job_id: string }> };

  const { data: disputes } = jobIds.length
    ? await db.from("disputes").select("id, reason").in("job_id", jobIds)
    : { data: [] as Array<{ id: string; reason: string }> };

  const { data: skills } = await db
    .from("provider_skills")
    .select("service_type_id, average_rating, completed_jobs_count")
    .eq("provider_id", providerId);

  const allReviews = reviews ?? [];
  const overallAvgRating = allReviews.length
    ? allReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / allReviews.length
    : null;

  const completionSignal = 1 - (provider?.cancellation_rate ?? 0);
  const ratingSignal = (overallAvgRating ?? 3.0) / 5;
  const providerQualityScore = Math.round((ratingSignal * 0.6 + completionSignal * 0.4) * 100) / 100;

  const serviceQualityScores: ServiceQualityScore[] = (skills ?? []).map((s: any) => ({
    serviceTypeId: s.service_type_id,
    averageRating: s.average_rating,
    completedJobsCount: s.completed_jobs_count,
  }));

  const repeatIssues: RepeatIssue[] = NEGATIVE_KEYWORDS.map((keyword) => ({
    keyword,
    occurrences: allReviews.filter((r: { comment: string | null }) =>
      r.comment?.toLowerCase().includes(keyword)
    ).length,
  })).filter((issue) => issue.occurrences >= 2);

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const oneEightyDaysAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const recentReviews = allReviews.filter((r: { created_at: string }) => new Date(r.created_at).getTime() >= ninetyDaysAgo);
  const priorReviews = allReviews.filter(
    (r: { created_at: string }) =>
      new Date(r.created_at).getTime() >= oneEightyDaysAgo && new Date(r.created_at).getTime() < ninetyDaysAgo
  );
  const recentAverageRating = recentReviews.length
    ? recentReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / recentReviews.length
    : null;
  const priorAverageRating = priorReviews.length
    ? priorReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / priorReviews.length
    : null;

  let trend: SentimentTrend["trend"] = "insufficient_data";
  if (recentAverageRating !== null && priorAverageRating !== null) {
    const delta = recentAverageRating - priorAverageRating;
    trend = delta > 0.2 ? "improving" : delta < -0.2 ? "declining" : "stable";
  }

  const riskAlerts: QualityRiskAlert[] = [];
  if (trend === "declining") {
    riskAlerts.push({ severity: "high", reason: "Average rating has declined over the last 90 days versus the prior period" });
  }
  if ((provider?.cancellation_rate ?? 0) > 0.2) {
    riskAlerts.push({ severity: "medium", reason: `Cancellation rate (${provider?.cancellation_rate}) exceeds 0.20` });
  }
  if ((disputes ?? []).length >= 2) {
    riskAlerts.push({ severity: "high", reason: `${disputes!.length} dispute(s) recorded against this provider` });
  }
  for (const issue of repeatIssues) {
    riskAlerts.push({ severity: "medium", reason: `Repeated customer complaint pattern: "${issue.keyword}" (${issue.occurrences} reviews)` });
  }

  const remediationPlan: string[] = riskAlerts.map((alert) => `Address: ${alert.reason}`);

  const certificationImpact: string[] = [];
  if (trend === "declining" || (provider?.cancellation_rate ?? 0) > 0.2) {
    certificationImpact.push("Quality decline may jeopardize active certification tiers at next recomputation if it continues.");
  }

  const trainingRecommendations = serviceQualityScores
    .filter((s) => (s.averageRating ?? 5) < 4.0)
    .map((s) => `Recommend additional training/support for service type ${s.serviceTypeId} (average rating ${s.averageRating ?? "n/a"})`);

  return {
    providerId,
    providerQualityScore,
    serviceQualityScores,
    repeatIssues,
    sentimentTrend: { recentAverageRating, priorAverageRating, trend },
    riskAlerts,
    remediationPlan,
    certificationImpact,
    trainingRecommendations,
  };
}
