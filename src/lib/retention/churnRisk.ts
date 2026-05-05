export function calculateChurnRisk(input: { daysSinceLastJob: number; completedJobs: number; lastRating?: number | null; openDisputes?: number }) {
  const score = Math.min(100, input.daysSinceLastJob * 0.45 - input.completedJobs * 4 + (input.openDisputes ?? 0) * 25 + (input.lastRating && input.lastRating < 4 ? 15 : 0));
  return {
    score: Math.round(Math.max(0, score)),
    level: score > 70 ? "high" : score > 35 ? "medium" : "low",
    reason: `${input.daysSinceLastJob} days since last booking with ${input.completedJobs} completed jobs.`,
  };
}
