import { scoreResult, type ScoreResult } from "./types";

export interface DispatchConfidenceInput {
  providerTrustScore?: number;
  categoryMatch?: boolean;
  serviceAreaMatch?: boolean;
  isOnline?: boolean;
  etaMinutes?: number | null;
  activeJobs?: number;
}

export function calculateDispatchConfidenceScore(input: DispatchConfidenceInput): ScoreResult {
  let score = input.providerTrustScore ?? 60;
  if (input.categoryMatch) score += 12;
  if (input.serviceAreaMatch) score += 12;
  if (input.isOnline) score += 8;
  if ((input.etaMinutes ?? 60) <= 30) score += 8;
  score -= Math.min(input.activeJobs ?? 0, 5) * 5;

  return scoreResult(
    score,
    [
      input.categoryMatch ? "Provider matches requested category." : "Category match is weak or unknown.",
      input.serviceAreaMatch ? "Provider covers the service area." : "Service area fit needs review.",
      `ETA is ${input.etaMinutes ?? "unknown"} minutes.`,
    ],
    [
      "Prefer providers with category and service-area match.",
      "Broadcast only when confidence is below 70 or urgency is high.",
    ],
    { inverted: true }
  );
}
