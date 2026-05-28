import { logger } from "@/runtime-core/observability"
import type { CognitionDomain } from "./cognition-engine"

export interface CognitionLineageRecord {
  lineageId: string
  parentLineageId?: string
  domain: CognitionDomain
  tenantId?: string
  reasoningIds: string[]
  depth: number
  conclusion: string
  confidence: number
  createdAt: string
  closedAt?: string
}

const LINEAGE: Map<string, CognitionLineageRecord> = new Map()
const MAX_LINEAGE = 1000

export function startLineage(
  domain: CognitionDomain,
  tenantId?: string,
  parentLineageId?: string,
): CognitionLineageRecord {
  if (LINEAGE.size >= MAX_LINEAGE) {
    const firstKey = Array.from(LINEAGE.keys())[0]
    if (firstKey !== undefined) LINEAGE.delete(firstKey)
  }

  const parentDepth = parentLineageId ? (LINEAGE.get(parentLineageId)?.depth ?? 0) : 0
  const record: CognitionLineageRecord = {
    lineageId: crypto.randomUUID(),
    parentLineageId,
    domain,
    tenantId,
    reasoningIds: [],
    depth: parentDepth + 1,
    conclusion: "",
    confidence: 0,
    createdAt: new Date().toISOString(),
  }

  LINEAGE.set(record.lineageId, record)
  logger.info(`Lineage started for domain: ${domain}`, "cognition-lineage", {
    tenantId, metadata: { lineageId: record.lineageId, depth: record.depth },
  })
  return record
}

export function addReasoning(lineageId: string, reasoningId: string): void {
  const record = LINEAGE.get(lineageId)
  if (record) {
    record.reasoningIds.push(reasoningId)
    LINEAGE.set(lineageId, record)
  }
}

export function updateConclusion(lineageId: string, conclusion: string, confidence: number): void {
  const record = LINEAGE.get(lineageId)
  if (record) {
    record.conclusion = conclusion
    record.confidence = confidence
    LINEAGE.set(lineageId, record)
  }
}

export function closeLineage(lineageId: string): void {
  const record = LINEAGE.get(lineageId)
  if (record) {
    record.closedAt = new Date().toISOString()
    LINEAGE.set(lineageId, record)
    logger.info(`Lineage closed: ${lineageId}`, "cognition-lineage")
  }
}

export function getLineageChain(lineageId: string): CognitionLineageRecord[] {
  const chain: CognitionLineageRecord[] = []
  let current = LINEAGE.get(lineageId)
  while (current) {
    chain.unshift(current)
    current = current.parentLineageId ? LINEAGE.get(current.parentLineageId) : undefined
  }
  return chain
}

export function getLineageSummary(): {
  total: number
  open: number
  avgDepth: number
  avgConfidence: number
} {
  const values = Array.from(LINEAGE.values())
  const total = values.length
  const open = values.filter((r) => !r.closedAt).length
  const avgDepth = total > 0 ? values.reduce((s, r) => s + r.depth, 0) / total : 0
  const avgConfidence = total > 0 ? values.reduce((s, r) => s + r.confidence, 0) / total : 0
  return { total, open, avgDepth, avgConfidence }
}
