export interface SynthesizedKnowledge {
  id: string
  topic: string
  summary: string
  sourceCount: number
  confidence: number
  actionable: boolean
  recommendedAction?: string
  synthesizedAt: string
}

const KNOWLEDGE: SynthesizedKnowledge[] = []
const MAX_KNOWLEDGE = 200

export function synthesize(
  topic: string,
  sources: { content: string; confidence: number }[]
): SynthesizedKnowledge {
  if (KNOWLEDGE.length >= MAX_KNOWLEDGE) KNOWLEDGE.shift()

  const avgConfidence =
    sources.length > 0
      ? sources.reduce((s, src) => s + src.confidence, 0) / sources.length
      : 0
  const confidence = avgConfidence * Math.min(1, sources.length / 3)
  const actionable = confidence > 0.7

  const record: SynthesizedKnowledge = {
    id: crypto.randomUUID(),
    topic,
    summary: `${sources.length} source(s) analyzed for topic "${topic}"`,
    sourceCount: sources.length,
    confidence,
    actionable,
    recommendedAction: actionable ? `Review ${topic} for optimization` : undefined,
    synthesizedAt: new Date().toISOString(),
  }
  KNOWLEDGE.push(record)
  return record
}

export function getKnowledgeByTopic(topic: string): SynthesizedKnowledge | undefined {
  return KNOWLEDGE.filter((k) => k.topic === topic).at(-1)
}

export function getActionableKnowledge(): SynthesizedKnowledge[] {
  return KNOWLEDGE.filter((k) => k.actionable)
}

export function getKnowledgeSummary(): {
  total: number
  actionable: number
  avgConfidence: number
} {
  const actionable = KNOWLEDGE.filter((k) => k.actionable).length
  const avgConfidence =
    KNOWLEDGE.length > 0
      ? KNOWLEDGE.reduce((s, k) => s + k.confidence, 0) / KNOWLEDGE.length
      : 0
  return { total: KNOWLEDGE.length, actionable, avgConfidence }
}
