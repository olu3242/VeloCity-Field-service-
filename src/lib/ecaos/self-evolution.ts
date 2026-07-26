// Self-Evolution Engine — continuously proposes platform improvements.
// Recommendations require governance approval before rollout.

export type EvolutionCategory =
  | "bottleneck_removal" | "automation_opportunity" | "architectural_refactor"
  | "new_ai_agent" | "dispatch_improvement" | "pricing_optimization"
  | "prompt_refinement" | "backlog_generation";

export type EvolutionStatus = "proposed" | "governance_review" | "approved" | "implementing" | "shipped" | "rejected";

export interface EvolutionRecommendation {
  id: string;
  category: EvolutionCategory;
  title: string;
  rationale: string;
  estimatedImpactPct: number;
  effortLevel: "low" | "medium" | "high";
  targetDomain: string;
  status: EvolutionStatus;
  detectedFrom: string;
  proposedAt: string;
  updatedAt: string;
  approvedAt?: string;
  shippedAt?: string;
}

const RECOMMENDATIONS: EvolutionRecommendation[] = [];
const CAP = 200;

export function proposeEvolution(params: {
  category: EvolutionCategory;
  title: string;
  rationale: string;
  estimatedImpactPct: number;
  effortLevel: "low" | "medium" | "high";
  targetDomain: string;
  detectedFrom: string;
}): EvolutionRecommendation {
  const now = new Date().toISOString();
  const rec: EvolutionRecommendation = {
    id: `evo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    status: "proposed",
    proposedAt: now,
    updatedAt: now,
  };
  if (RECOMMENDATIONS.length >= CAP) RECOMMENDATIONS.shift();
  RECOMMENDATIONS.push(rec);
  return rec;
}

export function advanceEvolutionStatus(id: string, status: EvolutionStatus): EvolutionRecommendation | null {
  const rec = RECOMMENDATIONS.find(r => r.id === id);
  if (!rec) return null;
  rec.status = status;
  rec.updatedAt = new Date().toISOString();
  if (status === "approved") rec.approvedAt = rec.updatedAt;
  if (status === "shipped") rec.shippedAt = rec.updatedAt;
  return rec;
}

export function getProposedEvolutions(): EvolutionRecommendation[] {
  return RECOMMENDATIONS.filter(r => r.status === "proposed" || r.status === "governance_review");
}

export function getShippedEvolutions(limit = 20): EvolutionRecommendation[] {
  return [...RECOMMENDATIONS].filter(r => r.status === "shipped").reverse().slice(0, limit);
}

export function getEvolutionsByCategory(category: EvolutionCategory): EvolutionRecommendation[] {
  return RECOMMENDATIONS.filter(r => r.category === category);
}

export function getEvolutionBacklog(limit = 50): EvolutionRecommendation[] {
  return [...RECOMMENDATIONS]
    .filter(r => r.status !== "rejected" && r.status !== "shipped")
    .sort((a, b) => b.estimatedImpactPct - a.estimatedImpactPct)
    .slice(0, limit);
}

export function getEvolutionStats() {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const r of RECOMMENDATIONS) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }
  const avgImpact = RECOMMENDATIONS.length
    ? RECOMMENDATIONS.reduce((s, r) => s + r.estimatedImpactPct, 0) / RECOMMENDATIONS.length : 0;
  return { total: RECOMMENDATIONS.length, byStatus, byCategory, avgImpactPct: Math.round(avgImpact) };
}
