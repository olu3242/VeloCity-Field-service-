import { type NormalizedScore, type ScoreDimension } from "./score-types"

export type ScoringFn = (entityId: string, context?: Record<string, unknown>) => NormalizedScore | Promise<NormalizedScore>

export interface Scorer {
  scorerId: string
  name: string
  dimension: ScoreDimension
  description: string
  fn: ScoringFn
  registeredAt: string
}

const SCORERS: Map<string, Scorer> = new Map()

const SCORE_HISTORY: { scorerId: string; entityId: string; score: NormalizedScore; ranAt: string }[] = []
const MAX_HISTORY = 500

export function registerScorer(
  scorerId: string,
  name: string,
  dimension: ScoreDimension,
  description: string,
  fn: ScoringFn
): void {
  SCORERS.set(scorerId, {
    scorerId,
    name,
    dimension,
    description,
    fn,
    registeredAt: new Date().toISOString(),
  })
}

export async function runScorer(scorerId: string, entityId: string, context?: Record<string, unknown>): Promise<NormalizedScore | null> {
  const scorer = SCORERS.get(scorerId)
  if (!scorer) return null
  const score = await scorer.fn(entityId, context)
  if (SCORE_HISTORY.length >= MAX_HISTORY) SCORE_HISTORY.shift()
  SCORE_HISTORY.push({ scorerId, entityId, score, ranAt: new Date().toISOString() })
  return score
}

export function getScorersByDimension(dimension: ScoreDimension): Scorer[] {
  return Array.from(SCORERS.values()).filter((s) => s.dimension === dimension)
}

export function getScoreHistory(entityId: string): typeof SCORE_HISTORY {
  return SCORE_HISTORY.filter((h) => h.entityId === entityId)
}

export function getRegisteredScorers(): Scorer[] {
  return Array.from(SCORERS.values())
}
