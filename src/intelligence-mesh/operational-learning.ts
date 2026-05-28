import { logger } from "@/runtime-core/observability"

export interface OperationalLearning {
  learningId: string
  learningType: string
  category: string
  insight: string
  confidence: number
  sampleCount: number
  sourceCount: number
  anonymous: boolean
  applicableRegions: string[]
  createdAt: string
  updatedAt: string
}

const LEARNINGS: Map<string, OperationalLearning> = new Map()
const MAX_LEARNINGS = 1000

function makeKey(type: string, category: string): string {
  return `${type}::${category}`
}

export function recordLearning(
  type: string,
  category: string,
  insight: string,
  confidence: number,
  anonymous = true,
  regions: string[] = [],
): OperationalLearning {
  if (LEARNINGS.size >= MAX_LEARNINGS && !LEARNINGS.has(makeKey(type, category))) {
    const firstKey = Array.from(LEARNINGS.keys())[0]
    if (firstKey !== undefined) LEARNINGS.delete(firstKey)
  }

  const key = makeKey(type, category)
  const existing = LEARNINGS.get(key)

  if (existing) {
    const n = existing.sampleCount
    existing.confidence = (existing.confidence * n + confidence) / (n + 1)
    existing.sampleCount += 1
    existing.updatedAt = new Date().toISOString()
    LEARNINGS.set(key, existing)
    return existing
  }

  const learning: OperationalLearning = {
    learningId: crypto.randomUUID(),
    learningType: type,
    category,
    insight,
    confidence,
    sampleCount: 1,
    sourceCount: 1,
    anonymous,
    applicableRegions: [...regions],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  LEARNINGS.set(key, learning)
  logger.info(`Operational learning recorded: ${type}/${category}`, "operational-learning", {
    metadata: { confidence },
  })
  return learning
}

export function getLearningsByCategory(category: string): OperationalLearning[] {
  return Array.from(LEARNINGS.values()).filter((l) => l.category === category)
}

export function getHighConfidenceLearnings(minConfidence = 0.75): OperationalLearning[] {
  return Array.from(LEARNINGS.values()).filter((l) => l.confidence >= minConfidence)
}

export function getLearningsSummary(): {
  total: number
  byCategory: Record<string, number>
  avgConfidence: number
  crossRegional: number
} {
  const values = Array.from(LEARNINGS.values())
  const total = values.length
  const byCategory: Record<string, number> = {}
  let totalConf = 0
  let crossRegional = 0
  for (const l of values) {
    byCategory[l.category] = (byCategory[l.category] ?? 0) + 1
    totalConf += l.confidence
    if (l.applicableRegions.length > 1) crossRegional += 1
  }
  return { total, byCategory, avgConfidence: total > 0 ? totalConf / total : 0, crossRegional }
}
