// Relationship Score Engine — dynamic composite scores for every participant type.
// Scores influence AI dispatch, coaching, franchise ranking, and commercial strategy.

export type ParticipantType = "customer" | "provider" | "franchise" | "commercial";

export type ScoreTier = "developing" | "established" | "trusted" | "champion" | "elite";

function tierFromScore(score: number): ScoreTier {
  if (score >= 90) return "elite";
  if (score >= 75) return "champion";
  if (score >= 60) return "trusted";
  if (score >= 40) return "established";
  return "developing";
}

export interface RelationshipScore {
  id: string;
  participantId: string;
  participantType: ParticipantType;
  tenantId: string;
  overallScore: number;               // 0–100
  components: Record<string, number>; // named component scores
  tier: ScoreTier;
  trend: "improving" | "stable" | "declining";
  previousScore?: number;
  updatedAt: string;
}

export interface ScoreDistribution {
  total: number;
  byTier: Record<ScoreTier, number>;
  avgScore: number;
  topDecile: number;  // 90th percentile threshold
}

const SCORES = new Map<string, RelationshipScore>(); // `participantType:tenantId:participantId`
const SCORE_HISTORY: Array<{ key: string; score: number; at: string }> = [];
const HISTORY_CAP = 5000;

function scoreKey(type: ParticipantType, tenantId: string, participantId: string): string {
  return `${type}:${tenantId}:${participantId}`;
}

const CUSTOMER_COMPONENTS = ["loyalty", "reviews", "membership", "referrals", "payment_history", "community_engagement"];
const PROVIDER_COMPONENTS = ["ratings", "rewards", "safety", "reliability", "training", "certifications", "compliance"];
const FRANCHISE_COMPONENTS = ["growth", "revenue", "workforce", "customer_experience", "compliance", "innovation"];
const COMMERCIAL_COMPONENTS = ["contract_value", "renewal_history", "payment_behavior", "sla_adherence", "expansion"];

const COMPONENT_MAP: Record<ParticipantType, string[]> = {
  customer: CUSTOMER_COMPONENTS,
  provider: PROVIDER_COMPONENTS,
  franchise: FRANCHISE_COMPONENTS,
  commercial: COMMERCIAL_COMPONENTS,
};

function computeOverall(components: Record<string, number>): number {
  const vals = Object.values(components);
  if (!vals.length) return 50;
  return Math.min(100, Math.max(0, Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)));
}

export function updateRelationshipScore(params: {
  participantId: string;
  participantType: ParticipantType;
  tenantId: string;
  componentUpdates: Partial<Record<string, number>>; // merge into existing components
}): RelationshipScore {
  const key = scoreKey(params.participantType, params.tenantId, params.participantId);
  const existing = SCORES.get(key);

  const defaults = COMPONENT_MAP[params.participantType];
  const baseComponents: Record<string, number> = existing?.components ?? Object.fromEntries(defaults.map(d => [d, 50]));
  const mergedComponents: Record<string, number> = { ...baseComponents };

  for (const [k, v] of Object.entries(params.componentUpdates)) {
    if (typeof v === "number") {
      mergedComponents[k] = Math.min(100, Math.max(0, v));
    }
  }

  const overallScore = computeOverall(mergedComponents);
  const previousScore = existing?.overallScore;
  const trend: RelationshipScore["trend"] =
    previousScore === undefined ? "stable"
    : overallScore > previousScore + 2 ? "improving"
    : overallScore < previousScore - 2 ? "declining"
    : "stable";

  const score: RelationshipScore = {
    id: key,
    participantId: params.participantId,
    participantType: params.participantType,
    tenantId: params.tenantId,
    overallScore,
    components: mergedComponents,
    tier: tierFromScore(overallScore),
    trend,
    previousScore,
    updatedAt: new Date().toISOString(),
  };

  SCORES.set(key, score);

  if (SCORE_HISTORY.length >= HISTORY_CAP) SCORE_HISTORY.shift();
  SCORE_HISTORY.push({ key, score: overallScore, at: score.updatedAt });

  return score;
}

export function getRelationshipScore(
  participantId: string,
  participantType: ParticipantType,
  tenantId: string,
): RelationshipScore | null {
  return SCORES.get(scoreKey(participantType, tenantId, participantId)) ?? null;
}

export function getTopParticipants(
  tenantId: string,
  participantType: ParticipantType,
  limit = 20,
): RelationshipScore[] {
  return Array.from(SCORES.values())
    .filter(s => s.tenantId === tenantId && s.participantType === participantType)
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, limit);
}

export function getScoreDistribution(tenantId: string, participantType?: ParticipantType): ScoreDistribution {
  const scores = Array.from(SCORES.values())
    .filter(s => s.tenantId === tenantId && (!participantType || s.participantType === participantType));

  const byTier: Record<ScoreTier, number> = {
    developing: 0, established: 0, trusted: 0, champion: 0, elite: 0,
  };
  for (const s of scores) byTier[s.tier]++;

  const vals = scores.map(s => s.overallScore).sort((a, b) => a - b);
  const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  const p90Index = Math.floor(vals.length * 0.9);
  const topDecile = vals.length ? (vals[p90Index] ?? vals[vals.length - 1]) : 0;

  return { total: scores.length, byTier, avgScore: avg, topDecile };
}

export function getScoreHistory(participantId: string, participantType: ParticipantType, tenantId: string, limit = 20) {
  const key = scoreKey(participantType, tenantId, participantId);
  return SCORE_HISTORY.filter(h => h.key === key).slice(-limit);
}
