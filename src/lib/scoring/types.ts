export type ScoreLevel = "low" | "medium" | "high" | "critical";

export interface ScoreResult {
  score: number;
  level: ScoreLevel;
  reasons: string[];
  recommendations: string[];
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function levelFromScore(score: number, inverted = false): ScoreLevel {
  const value = clampScore(score);
  if (inverted) {
    if (value >= 80) return "low";
    if (value >= 60) return "medium";
    if (value >= 35) return "high";
    return "critical";
  }
  if (value >= 85) return "critical";
  if (value >= 65) return "high";
  if (value >= 35) return "medium";
  return "low";
}

export function scoreResult(
  score: number,
  reasons: string[],
  recommendations: string[],
  options: { inverted?: boolean } = {}
): ScoreResult {
  const normalized = clampScore(score);
  return {
    score: normalized,
    level: levelFromScore(normalized, options.inverted),
    reasons,
    recommendations,
  };
}
