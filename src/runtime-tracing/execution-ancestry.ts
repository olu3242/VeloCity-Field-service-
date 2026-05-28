import { logger } from "@/runtime-core/observability"

export interface AncestryRecord {
  executionId: string
  parentExecutionId?: string
  rootExecutionId: string
  depth: number
  workflowType: string
  tenantId?: string
  correlationId: string
  childExecutionIds: string[]
  createdAt: string
}

const ANCESTRY: Map<string, AncestryRecord> = new Map()
const MAX_ANCESTRY = 5000

export function registerExecution(
  executionId: string,
  workflowType: string,
  correlationId: string,
  parentExecutionId?: string,
  tenantId?: string
): AncestryRecord {
  if (ANCESTRY.size >= MAX_ANCESTRY) {
    const oldest = Array.from(ANCESTRY.keys())[0]
    if (oldest !== undefined) ANCESTRY.delete(oldest)
  }
  const parentRecord = parentExecutionId ? ANCESTRY.get(parentExecutionId) : undefined
  const rootExecutionId = !parentExecutionId ? executionId : (parentRecord?.rootExecutionId ?? executionId)
  const depth = !parentExecutionId ? 0 : (parentRecord ? parentRecord.depth + 1 : 0)

  const record: AncestryRecord = {
    executionId,
    parentExecutionId,
    rootExecutionId,
    depth,
    workflowType,
    tenantId,
    correlationId,
    childExecutionIds: [],
    createdAt: new Date().toISOString(),
  }
  ANCESTRY.set(executionId, record)

  if (parentRecord) {
    parentRecord.childExecutionIds.push(executionId)
  }

  logger.info(`Execution registered: ${executionId} depth=${depth}`, "execution-ancestry")
  return record
}

export function getRootExecution(executionId: string): AncestryRecord | undefined {
  const record = ANCESTRY.get(executionId)
  if (!record) return undefined
  if (record.depth === 0) return record
  return ANCESTRY.get(record.rootExecutionId)
}

export function getAncestryChain(executionId: string): AncestryRecord[] {
  const record = ANCESTRY.get(executionId)
  if (!record) return []
  const chain: AncestryRecord[] = []
  const root = ANCESTRY.get(record.rootExecutionId)
  if (!root) return [record]

  // Walk from root down to executionId
  const allRecords = Array.from(ANCESTRY.values()).filter(
    (r) => r.rootExecutionId === record.rootExecutionId
  )
  allRecords.sort((a, b) => a.depth - b.depth)

  // Include only ancestors up to and including this execution
  for (const r of allRecords) {
    chain.push(r)
    if (r.executionId === executionId) break
  }
  return chain
}

export function getDescendants(executionId: string): AncestryRecord[] {
  const record = ANCESTRY.get(executionId)
  if (!record) return []
  return Array.from(ANCESTRY.values()).filter(
    (r) => r.rootExecutionId === record.rootExecutionId && r.depth > record.depth
  )
}

export function getAncestrySummary(): {
  total: number
  maxDepth: number
  avgDepth: number
  rootCount: number
} {
  const values = Array.from(ANCESTRY.values())
  const maxDepth = values.reduce((max, r) => Math.max(max, r.depth), 0)
  const avgDepth = values.length > 0 ? values.reduce((sum, r) => sum + r.depth, 0) / values.length : 0
  const rootCount = values.filter((r) => r.depth === 0).length
  return { total: values.length, maxDepth, avgDepth, rootCount }
}
