import { DispatchJob, ProviderCandidate } from "./dispatch-types";

/**
 * Find providers matching a job category within a geographic radius.
 *
 * This is a stub — in production this would query the database using
 * PostGIS or a similar geospatial index.
 */
export function findMatchingProviders(
  _jobCategory: string,
  _lat: number,
  _lng: number,
  _radiusMiles: number
): ProviderCandidate[] {
  return [];
}

/**
 * Compute a match score that weights proximity and provider quality.
 *
 * Score components (all normalised 0-1):
 *   trustScore     40 %
 *   distance       30 % (closer is better, capped at radiusMiles = 50)
 *   acceptRate     20 %
 *   etaMinutes     10 % (quicker is better, capped at 120 min)
 */
export function computeMatchScore(
  provider: ProviderCandidate,
  job: DispatchJob
): number {
  const maxDistance = 50;
  const maxEta = 120;

  const distanceClamped = Math.min(provider.distanceMiles, maxDistance);
  const distanceScore = 1 - distanceClamped / maxDistance;

  const etaClamped = Math.min(provider.etaMinutes, maxEta);
  const etaScore = 1 - etaClamped / maxEta;

  // Urgency modifier: for emergency jobs, distance carries more weight.
  let urgencyMultiplier = 1;
  if (job.urgency === "emergency") {
    urgencyMultiplier = distanceScore < 0.5 ? 0.8 : 1.2;
  }

  const raw =
    (provider.trustScore * 0.4 +
      distanceScore * 0.3 +
      provider.acceptRate * 0.2 +
      etaScore * 0.1) *
    urgencyMultiplier;

  return Math.min(1, Math.max(0, raw));
}

/**
 * Rank candidates by their computed match score, descending.
 */
export function rankProviders(
  candidates: ProviderCandidate[],
  job: DispatchJob
): ProviderCandidate[] {
  return [...candidates]
    .map((c) => ({ ...c, score: computeMatchScore(c, job) }))
    .sort((a, b) => b.score - a.score);
}
