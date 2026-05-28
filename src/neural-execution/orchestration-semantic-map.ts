import { logger } from "@/runtime-core/observability"

export type SemanticIntent =
  | "fulfill" | "remediate" | "optimize" | "validate" | "authorize"
  | "notify" | "transform" | "aggregate" | "distribute" | "federate"

export interface SemanticMapping {
  mappingId: string
  workflowType: string
  stepName?: string
  intent: SemanticIntent
  confidence: number
  semanticTags: string[]
  mappedAt: string
  usageCount: number
}

const MAPPINGS: Map<string, SemanticMapping> = new Map()
const MAPPING_CAP = 1000

export function mapIntent(
  workflowType: string,
  intent: SemanticIntent,
  confidence: number,
  tags: string[],
  stepName?: string,
): SemanticMapping {
  if (MAPPINGS.size >= MAPPING_CAP && !MAPPINGS.has(workflowType)) {
    const firstKey = Array.from(MAPPINGS.keys())[0]
    MAPPINGS.delete(firstKey)
  }
  const existing = MAPPINGS.get(workflowType)
  if (existing) {
    existing.intent = intent
    existing.confidence = Math.max(0, Math.min(1, confidence))
    existing.semanticTags = tags
    existing.stepName = stepName
    existing.mappedAt = new Date().toISOString()
    return existing
  }
  const mapping: SemanticMapping = {
    mappingId: crypto.randomUUID(),
    workflowType,
    stepName,
    intent,
    confidence: Math.max(0, Math.min(1, confidence)),
    semanticTags: tags,
    mappedAt: new Date().toISOString(),
    usageCount: 0,
  }
  MAPPINGS.set(workflowType, mapping)
  logger.info(`Semantic mapping created: ${workflowType} → ${intent}`, "orchestration-semantic-map")
  return mapping
}

export function recordUsage(workflowType: string): void {
  const mapping = MAPPINGS.get(workflowType)
  if (mapping) mapping.usageCount += 1
}

export function getMapping(workflowType: string): SemanticMapping | undefined {
  return MAPPINGS.get(workflowType)
}

export function getByIntent(intent: SemanticIntent): SemanticMapping[] {
  return Array.from(MAPPINGS.values()).filter(m => m.intent === intent)
}

export function getMappingSummary(): { total: number; byIntent: Record<string, number>; avgConfidence: number } {
  const values = Array.from(MAPPINGS.values())
  const byIntent: Record<string, number> = {}
  let totalConfidence = 0
  for (const m of values) {
    byIntent[m.intent] = (byIntent[m.intent] ?? 0) + 1
    totalConfidence += m.confidence
  }
  const avgConfidence = values.length > 0 ? totalConfidence / values.length : 0
  return { total: MAPPINGS.size, byIntent, avgConfidence }
}
