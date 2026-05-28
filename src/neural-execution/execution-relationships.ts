import { logger } from "@/runtime-core/observability"

export type RelationshipType = "parent_child" | "sibling" | "retry_chain" | "compensation" | "federated" | "causal"

export interface ExecutionRelationship {
  relationId: string
  sourceExecutionId: string
  targetExecutionId: string
  relationshipType: RelationshipType
  strength: number
  tenantId?: string
  establishedAt: string
  metadata: Record<string, unknown>
}

const RELATIONSHIPS: ExecutionRelationship[] = []
const REL_CAP = 3000

export function recordRelationship(
  sourceId: string,
  targetId: string,
  type: RelationshipType,
  strength: number,
  tenantId?: string,
): ExecutionRelationship {
  if (RELATIONSHIPS.length >= REL_CAP) RELATIONSHIPS.shift()
  const rel: ExecutionRelationship = {
    relationId: crypto.randomUUID(),
    sourceExecutionId: sourceId,
    targetExecutionId: targetId,
    relationshipType: type,
    strength: Math.max(0, Math.min(1, strength)),
    tenantId,
    establishedAt: new Date().toISOString(),
    metadata: {},
  }
  RELATIONSHIPS.push(rel)
  logger.info(`Relationship recorded: ${type}`, "execution-relationships", { metadata: { sourceId, targetId } })
  return rel
}

export function getRelationships(executionId: string): ExecutionRelationship[] {
  return RELATIONSHIPS.filter(r => r.sourceExecutionId === executionId || r.targetExecutionId === executionId)
}

export function getChain(executionId: string, type: RelationshipType): ExecutionRelationship[] {
  const chain: ExecutionRelationship[] = []
  let currentId = executionId
  const visited = new Set<string>()
  while (true) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const next = RELATIONSHIPS.find(r => r.sourceExecutionId === currentId && r.relationshipType === type)
    if (!next) break
    chain.push(next)
    currentId = next.targetExecutionId
  }
  return chain
}

export function getRelationshipSummary(): { total: number; byType: Record<string, number>; avgStrength: number } {
  const byType: Record<string, number> = {}
  let totalStrength = 0
  for (const r of RELATIONSHIPS) {
    byType[r.relationshipType] = (byType[r.relationshipType] ?? 0) + 1
    totalStrength += r.strength
  }
  const avgStrength = RELATIONSHIPS.length > 0 ? totalStrength / RELATIONSHIPS.length : 0
  return { total: RELATIONSHIPS.length, byType, avgStrength }
}
