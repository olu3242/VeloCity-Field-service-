import { ProviderKPI } from "./analytics-types";

export function computeProviderKPI(
  providerId: string,
  jobs: Array<Record<string, unknown>>,
  period: string
): ProviderKPI {
  const providerJobs = jobs.filter((j) => j["providerId"] === providerId);

  const jobsCompleted = providerJobs.filter((j) => j["status"] === "completed").length;

  const ratings = providerJobs
    .map((j) => (typeof j["rating"] === "number" ? j["rating"] : null))
    .filter((r): r is number => r !== null);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const earningsCents = providerJobs.reduce((sum, j) => {
    return sum + (typeof j["providerPayoutCents"] === "number" ? j["providerPayoutCents"] : 0);
  }, 0);

  const offeredJobs = providerJobs.filter((j) => j["offered"] === true).length;
  const acceptedJobs = providerJobs.filter((j) => j["accepted"] === true).length;
  const acceptRate = offeredJobs > 0 ? acceptedJobs / offeredJobs : 0;

  const responseTimes = providerJobs
    .map((j) =>
      typeof j["responseMinutes"] === "number" ? j["responseMinutes"] : null
    )
    .filter((t): t is number => t !== null);
  const avgResponseMinutes =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const trustScores = providerJobs
    .map((j) => (typeof j["trustScore"] === "number" ? j["trustScore"] : null))
    .filter((s): s is number => s !== null);
  const trustScore =
    trustScores.length > 0
      ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length
      : 0;

  return {
    providerId,
    period,
    jobsCompleted,
    avgRating,
    earningsCents,
    acceptRate,
    avgResponseMinutes,
    trustScore,
  };
}

export function rankProviders(kpis: ProviderKPI[]): ProviderKPI[] {
  return [...kpis].sort((a, b) => b.earningsCents - a.earningsCents);
}
