export interface EnforcementRecommendation {
  id: string;
  policyId: string;
  recommendation: string;
  rationale: string;
  priority: "low" | "medium" | "high";
  createdAt: string;
  applied: boolean;
}

const RECOMMENDATIONS: EnforcementRecommendation[] = [];
const CAP = 100;

export function generateRecommendation(
  policyId: string,
  recommendation: string,
  rationale: string,
  priority: EnforcementRecommendation["priority"]
): EnforcementRecommendation {
  const rec: EnforcementRecommendation = {
    id: crypto.randomUUID(),
    policyId,
    recommendation,
    rationale,
    priority,
    createdAt: new Date().toISOString(),
    applied: false,
  };
  RECOMMENDATIONS.push(rec);
  if (RECOMMENDATIONS.length > CAP) {
    RECOMMENDATIONS.splice(0, RECOMMENDATIONS.length - CAP);
  }
  return rec;
}

export function markApplied(id: string): void {
  const rec = RECOMMENDATIONS.find((r) => r.id === id);
  if (rec) {
    rec.applied = true;
  }
}

export function getPendingRecommendations(
  priority?: EnforcementRecommendation["priority"]
): EnforcementRecommendation[] {
  const pending = RECOMMENDATIONS.filter((r) => !r.applied);
  if (priority !== undefined) {
    return pending.filter((r) => r.priority === priority);
  }
  return pending;
}

export function getRecommendationStats(): {
  total: number;
  applied: number;
  pending: number;
  byPriority: Record<string, number>;
} {
  const total = RECOMMENDATIONS.length;
  const applied = RECOMMENDATIONS.filter((r) => r.applied).length;
  const pending = total - applied;

  const byPriority: Record<string, number> = {};
  for (const rec of RECOMMENDATIONS) {
    byPriority[rec.priority] = (byPriority[rec.priority] ?? 0) + 1;
  }

  return { total, applied, pending, byPriority };
}
