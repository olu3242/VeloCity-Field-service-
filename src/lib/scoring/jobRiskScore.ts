import type { UrgencyLevel } from "@/types";
import { scoreResult, type ScoreResult } from "./types";

export interface JobRiskInput {
  urgency?: UrgencyLevel | string | null;
  hasPhotos?: boolean;
  descriptionLength?: number;
  estimatedCostCents?: number | null;
  customerTrustScore?: number;
  providerAssigned?: boolean;
}

export function calculateJobRiskScore(input: JobRiskInput): ScoreResult {
  let score = 20;
  if (input.urgency === "same_day") score += 15;
  if (input.urgency === "emergency") score += 30;
  if (!input.hasPhotos) score += 8;
  if ((input.descriptionLength ?? 0) < 40) score += 10;
  if ((input.estimatedCostCents ?? 0) > 75000) score += 12;
  if ((input.customerTrustScore ?? 75) < 50) score += 15;
  if (!input.providerAssigned) score += 7;

  return scoreResult(
    score,
    [
      `Urgency is ${input.urgency ?? "unknown"}.`,
      input.hasPhotos ? "Photos reduce diagnostic ambiguity." : "No photos increase diagnostic uncertainty.",
      input.providerAssigned ? "Provider is assigned." : "No provider is assigned yet.",
    ],
    [
      "Request photos and a clear issue description before dispatch.",
      "Use quote approval before work begins for high-risk jobs.",
      "Monitor SLA timers for same-day and emergency work.",
    ]
  );
}
