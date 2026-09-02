/**
 * IDXF Engine 89 — Recommendation Engine.
 *
 * Ranks candidate values for a reference field — which provider to dispatch,
 * which territory to assign — from signals the caller supplies.
 *
 * Scoring is transparent: every recommendation carries the per-signal
 * contributions that produced it, so an operator can see why a candidate ranked
 * where it did rather than being handed an opaque number.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getField } from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";

export type RecommendationSignal =
  | "text_relevance"
  | "history"
  | "proximity"
  | "trust_score"
  | "availability"
  | "workload"
  | "rating";

export interface SignalScore {
  signal: RecommendationSignal;
  /** Normalised 0–1 contribution before weighting. */
  value: number;
  weight: number;
  detail: string;
}

export interface Recommendation {
  id: string;
  title: string;
  /** Weighted composite, 0–1. */
  score: number;
  confidence: number;
  signals: SignalScore[];
  /** Plain-language justification assembled from the strongest signals. */
  rationale: string;
}

export interface CandidateInput {
  id: string;
  title: string;
  /** Raw values the engine normalises. */
  trustScore?: number;
  rating?: number;
  distanceKm?: number;
  isAvailable?: boolean;
  activeJobCount?: number;
  /** Times this candidate was chosen before in the same context. */
  historicalSelections?: number;
  /** Relevance from the lookup engine, already 0–1. */
  textRelevance?: number;
}

export interface RecommendOptions {
  /** Override the default signal weights. */
  weights?: Partial<Record<RecommendationSignal, number>>;
  limit?: number;
  /** Drop candidates scoring below this. */
  minScore?: number;
  /** Distance beyond which proximity contributes nothing. */
  maxDistanceKm?: number;
  /** Workload at which a candidate is considered saturated. */
  saturationJobCount?: number;
}

const DEFAULT_WEIGHTS: Record<RecommendationSignal, number> = {
  trust_score: 0.25,
  proximity: 0.2,
  availability: 0.2,
  rating: 0.15,
  history: 0.1,
  workload: 0.05,
  text_relevance: 0.05,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Scores one candidate.
 *
 * Signals the caller did not supply are omitted entirely rather than scored 0 —
 * treating "unknown distance" as "infinitely far" would silently penalise every
 * candidate whose location simply was not loaded.
 */
function scoreCandidate(
  candidate: CandidateInput,
  weights: Record<RecommendationSignal, number>,
  options: RecommendOptions
): { signals: SignalScore[]; score: number } {
  const signals: SignalScore[] = [];
  const maxDistance = options.maxDistanceKm ?? 80;
  const saturation = options.saturationJobCount ?? 10;

  if (candidate.trustScore !== undefined) {
    const value = clamp01(candidate.trustScore / 100);
    signals.push({
      signal: "trust_score",
      value,
      weight: weights.trust_score,
      detail: `Trust score ${candidate.trustScore}/100`,
    });
  }

  if (candidate.rating !== undefined) {
    const value = clamp01(candidate.rating / 5);
    signals.push({
      signal: "rating",
      value,
      weight: weights.rating,
      detail: `Rated ${candidate.rating.toFixed(1)}/5`,
    });
  }

  if (candidate.distanceKm !== undefined) {
    const value = clamp01(1 - candidate.distanceKm / maxDistance);
    signals.push({
      signal: "proximity",
      value,
      weight: weights.proximity,
      detail: `${candidate.distanceKm.toFixed(1)} km away`,
    });
  }

  if (candidate.isAvailable !== undefined) {
    signals.push({
      signal: "availability",
      value: candidate.isAvailable ? 1 : 0,
      weight: weights.availability,
      detail: candidate.isAvailable ? "Currently available" : "Not currently available",
    });
  }

  if (candidate.activeJobCount !== undefined) {
    // Lighter load scores higher, so work spreads rather than concentrating.
    const value = clamp01(1 - candidate.activeJobCount / saturation);
    signals.push({
      signal: "workload",
      value,
      weight: weights.workload,
      detail: `${candidate.activeJobCount} active job(s)`,
    });
  }

  if (candidate.historicalSelections !== undefined) {
    const value = clamp01(candidate.historicalSelections / 5);
    signals.push({
      signal: "history",
      value,
      weight: weights.history,
      detail: `Chosen ${candidate.historicalSelections} time(s) before`,
    });
  }

  if (candidate.textRelevance !== undefined) {
    signals.push({
      signal: "text_relevance",
      value: clamp01(candidate.textRelevance),
      weight: weights.text_relevance,
      detail: `Search relevance ${Math.round(candidate.textRelevance * 100)}%`,
    });
  }

  // Normalise by the weight actually in play, so a candidate is not penalised
  // for signals nobody supplied for anyone.
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const weighted = signals.reduce((sum, s) => sum + s.value * s.weight, 0);
  const score = totalWeight === 0 ? 0 : weighted / totalWeight;

  return { signals, score: Number(score.toFixed(4)) };
}

function buildRationale(signals: SignalScore[]): string {
  const ranked = [...signals]
    .map((s) => ({ ...s, contribution: s.value * s.weight }))
    .sort((a, b) => b.contribution - a.contribution);

  const positives = ranked.filter((s) => s.value >= 0.6).slice(0, 3);
  const negatives = ranked.filter((s) => s.value < 0.3).slice(0, 2);

  const parts: string[] = [];
  if (positives.length > 0) parts.push(positives.map((s) => s.detail).join(", "));
  if (negatives.length > 0) parts.push(`but ${negatives.map((s) => s.detail.toLowerCase()).join(" and ")}`);

  return parts.length > 0 ? parts.join(" — ") : "No strong signals available.";
}

export interface RecommendationResult {
  entity: string;
  field?: string;
  recommendations: Recommendation[];
  /** Signals that contributed across the candidate set. */
  signalsUsed: RecommendationSignal[];
  candidateCount: number;
  /**
   * True when no candidate supplied enough signals to rank meaningfully.
   * Callers should fall back to manual selection rather than trusting the order.
   */
  insufficientSignal: boolean;
  generatedAt: string;
}

/** Ranks candidates for a reference field. */
export function recommend(
  entity: string,
  candidates: CandidateInput[],
  options: RecommendOptions & { field?: string } = {}
): RecommendationResult {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };

  const scored = candidates.map((candidate) => {
    const { signals, score } = scoreCandidate(candidate, weights, options);
    return {
      id: candidate.id,
      title: candidate.title,
      score,
      confidence: Math.round(score * 100),
      signals,
      rationale: buildRationale(signals),
    } satisfies Recommendation;
  });

  const filtered = scored
    .filter((r) => r.score >= (options.minScore ?? 0))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, options.limit ?? 5);

  const signalsUsed = Array.from(
    new Set(scored.flatMap((r) => r.signals.map((s) => s.signal)))
  );

  // With fewer than two signals per candidate the ordering is close to
  // arbitrary; saying so is more useful than presenting a confident ranking.
  const averageSignals = scored.length === 0
    ? 0
    : scored.reduce((sum, r) => sum + r.signals.length, 0) / scored.length;

  return {
    entity,
    ...(options.field !== undefined ? { field: options.field } : {}),
    recommendations: filtered,
    signalsUsed,
    candidateCount: candidates.length,
    insufficientSignal: averageSignals < 2,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Recommends values for a reference field, validating that the field can
 * actually hold them.
 */
export function recommendForField(
  entity: string,
  fieldName: string,
  candidates: CandidateInput[],
  options: RecommendOptions = {}
): RecommendationResult {
  const field = getField(entity, fieldName);
  if (!field) {
    throw new Error(`[IDXF/recommendation-engine] unknown field: ${entity}.${fieldName}`);
  }
  if (!field.targetEntity) {
    throw new Error(
      `[IDXF/recommendation-engine] field '${entity}.${fieldName}' is not a reference field`
    );
  }
  if (!field.aiSuggestions) {
    // Recommending into a field whose metadata opted out would bypass a
    // deliberate configuration choice.
    throw new Error(
      `[IDXF/recommendation-engine] field '${entity}.${fieldName}' has aiSuggestions disabled`
    );
  }
  if (!getEntity(field.targetEntity)) {
    throw new Error(`[IDXF/recommendation-engine] unknown target entity: ${field.targetEntity}`);
  }

  return recommend(field.targetEntity, candidates, { ...options, field: fieldName });
}

export { DEFAULT_WEIGHTS as DEFAULT_RECOMMENDATION_WEIGHTS };
