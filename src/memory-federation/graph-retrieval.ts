import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface MemoryRetrievalResult {
  retrievalId: string; queryContextId: string; tenantId?: string
  matchedContextIds: string[]; relevanceScores: Record<string, number>
  retrievalStrategy: "similarity" | "ancestry" | "semantic_link" | "temporal_window"
  retrievedAt: string; durationMs: number
}

const RESULTS: MemoryRetrievalResult[] = []
const RESULTS_CAP = 500

function computeScores(
  strategy: MemoryRetrievalResult["retrievalStrategy"],
  candidateIds: string[]
): Record<string, number> {
  const scores: Record<string, number> = {}
  candidateIds.forEach((id, index) => {
    switch (strategy) {
      case "similarity":
        scores[id] = 0.5 + index * 0.05
        break
      case "ancestry":
        scores[id] = 1.0 - index * 0.1
        break
      case "semantic_link":
        scores[id] = 0.8
        break
      case "temporal_window":
        scores[id] = 0.6
        break
    }
  })
  return scores
}

export function retrieve(
  queryContextId: string,
  strategy: MemoryRetrievalResult["retrievalStrategy"],
  candidateIds: string[],
  tenantId?: string
): MemoryRetrievalResult {
  void isRuntimePaused()
  const relevanceScores = computeScores(strategy, candidateIds)
  const matchedContextIds = [...candidateIds].sort(
    (a, b) => (relevanceScores[b] ?? 0) - (relevanceScores[a] ?? 0)
  )
  const result: MemoryRetrievalResult = {
    retrievalId: crypto.randomUUID(), queryContextId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    matchedContextIds, relevanceScores, retrievalStrategy: strategy,
    retrievedAt: new Date().toISOString(), durationMs: 1,
  }
  RESULTS.push(result)
  if (RESULTS.length > RESULTS_CAP) RESULTS.splice(0, RESULTS.length - RESULTS_CAP)
  logger.info("graph-retrieval", { retrievalId: result.retrievalId, queryContextId, strategy, matched: matchedContextIds.length })
  return result
}

export function getRecentRetrievals(limit = 20): MemoryRetrievalResult[] {
  return RESULTS.slice(-limit)
}

export function getRetrievalSummary(): {
  total: number; byStrategy: Record<string, number>; avgDurationMs: number; avgMatchCount: number
} {
  const total = RESULTS.length
  const byStrategy: Record<string, number> = {}
  let durSum = 0
  let matchSum = 0
  for (const r of RESULTS) {
    byStrategy[r.retrievalStrategy] = (byStrategy[r.retrievalStrategy] ?? 0) + 1
    durSum += r.durationMs
    matchSum += r.matchedContextIds.length
  }
  const avgDurationMs = total > 0 ? durSum / total : 0
  const avgMatchCount = total > 0 ? matchSum / total : 0
  return { total, byStrategy, avgDurationMs, avgMatchCount }
}
