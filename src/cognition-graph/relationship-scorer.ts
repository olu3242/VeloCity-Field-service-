import { logger } from "@/runtime-core/observability"

export interface CognitionRelationship {
  relationshipId: string
  entityA: string
  entityB: string
  tenantId?: string
  relationshipType: "causal" | "correlative" | "inhibitory" | "amplifying" | "neutral"
  strength: number
  confidence: number
  observationCount: number
  lastObservedAt: string
}

const RELATIONSHIPS = new Map<string, CognitionRelationship>()
const RELATIONSHIPS_CAP = 2000

export function observeRelationship(
  entityA: string,
  entityB: string,
  type: CognitionRelationship["relationshipType"],
  observedStrength: number,
  tenantId?: string
): CognitionRelationship {
  const key = `${entityA}:${entityB}`
  const existing = RELATIONSHIPS.get(key)
  if (existing) {
    existing.strength = 0.7 * existing.strength + 0.3 * observedStrength
    existing.observationCount++
    existing.confidence = Math.min(0.99, existing.observationCount / 10)
    existing.lastObservedAt = new Date().toISOString()
    return existing
  }

  if (RELATIONSHIPS.size >= RELATIONSHIPS_CAP) {
    const firstKey = Array.from(RELATIONSHIPS.keys())[0]
    if (firstKey !== undefined) RELATIONSHIPS.delete(firstKey)
    logger.warn("RELATIONSHIPS cap reached, evicted oldest entry")
  }

  const rel: CognitionRelationship = {
    relationshipId: crypto.randomUUID(),
    entityA,
    entityB,
    tenantId,
    relationshipType: type,
    strength: observedStrength,
    confidence: 0.1,
    observationCount: 1,
    lastObservedAt: new Date().toISOString(),
  }
  RELATIONSHIPS.set(key, rel)
  return rel
}

export function getStrongRelationships(minStrength?: number): CognitionRelationship[] {
  const threshold = minStrength ?? 0.7
  return Array.from(RELATIONSHIPS.values()).filter((r) => r.strength >= threshold)
}

export function getRelationshipsForEntity(entityId: string): CognitionRelationship[] {
  return Array.from(RELATIONSHIPS.values()).filter(
    (r) => r.entityA === entityId || r.entityB === entityId
  )
}

export function getRelationshipSummary(): {
  total: number
  byType: Record<string, number>
  avgStrength: number
  avgConfidence: number
} {
  const all = Array.from(RELATIONSHIPS.values())
  const total = all.length
  const byType: Record<string, number> = {}
  for (const r of all) {
    byType[r.relationshipType] = (byType[r.relationshipType] ?? 0) + 1
  }
  const avgStrength = total > 0 ? all.reduce((s, r) => s + r.strength, 0) / total : 0
  const avgConfidence = total > 0 ? all.reduce((s, r) => s + r.confidence, 0) / total : 0
  return { total, byType, avgStrength, avgConfidence }
}
