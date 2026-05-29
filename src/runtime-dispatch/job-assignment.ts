import { DispatchJob, DispatchDecision, ProviderCandidate } from "./dispatch-types";

/**
 * Score a single candidate for a given job.
 *
 * Weights:
 *   trustScore        40 %
 *   distance inverse  30 %
 *   acceptRate        20 %
 *   urgency bonus     10 %
 */
export function scoreCandidate(
  candidate: ProviderCandidate,
  job: DispatchJob
): number {
  // Distance component: closer is better.
  // Use inverse-distance ratio capped at a 50-mile practical radius.
  const maxRadius = 50;
  const distanceClamped = Math.min(candidate.distanceMiles, maxRadius);
  const distanceScore = 1 - distanceClamped / maxRadius;

  // Urgency bonus: emergency jobs reward providers who are already close.
  let urgencyBonus = 0;
  if (job.urgency === "emergency") {
    // Full bonus for providers within 5 miles, scaling down to 0 at 20 miles.
    urgencyBonus = Math.max(0, 1 - candidate.distanceMiles / 20);
  } else if (job.urgency === "same_day") {
    urgencyBonus = Math.max(0, 1 - candidate.distanceMiles / 40);
  } else {
    // scheduled — mild bonus for availability (use acceptRate as proxy)
    urgencyBonus = candidate.acceptRate;
  }

  const score =
    candidate.trustScore * 0.4 +
    distanceScore * 0.3 +
    candidate.acceptRate * 0.2 +
    urgencyBonus * 0.1;

  return Math.min(1, Math.max(0, score));
}

/**
 * Filter out providers who are offline or exceed the practical radius
 * for the urgency level.
 */
export function filterEligibleProviders(
  candidates: ProviderCandidate[],
  job: DispatchJob
): ProviderCandidate[] {
  const radiusLimits: Record<DispatchJob["urgency"], number> = {
    emergency: 20,
    same_day: 40,
    scheduled: 100,
  };
  const maxRadius = radiusLimits[job.urgency];

  return candidates.filter(
    (c) => c.isOnline && c.distanceMiles <= maxRadius
  );
}

/**
 * Assign a job to the best available provider from the candidate list.
 */
export function assignJob(
  job: DispatchJob,
  candidates: ProviderCandidate[]
): DispatchDecision {
  const eligible = filterEligibleProviders(candidates, job);

  if (eligible.length === 0) {
    return {
      jobId: job.id,
      selectedProviderId: null,
      candidates,
      confidence: 0,
      reason: "No eligible providers found within range or all providers offline",
      dispatchedAt: new Date().toISOString(),
    };
  }

  // Score and sort descending.
  const scored = eligible
    .map((c) => ({ ...c, score: scoreCandidate(c, job) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  // Confidence: gap between top score and runner-up (or just top score if only one).
  const runnerUp = scored[1];
  const confidence =
    runnerUp != null
      ? Math.min(1, best.score - runnerUp.score + 0.5)
      : best.score;

  return {
    jobId: job.id,
    selectedProviderId: best.providerId,
    candidates: scored,
    confidence: parseFloat(confidence.toFixed(4)),
    reason: `Selected provider ${best.providerId} with score ${best.score.toFixed(4)}`,
    dispatchedAt: new Date().toISOString(),
  };
}
