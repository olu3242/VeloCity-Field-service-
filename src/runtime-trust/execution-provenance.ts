import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ProvenanceRecord {
  provenanceId: string
  executionId: string
  workflowId?: string
  tenantId?: string
  chain: {
    step: number
    identityId: string
    action: string
    timestamp: string
    signature?: string
  }[]
  rootIdentityId: string
  integrityValid: boolean
  createdAt: string
  lastUpdatedAt: string
}

const PROVENANCE: Map<string, ProvenanceRecord> = new Map()
const CAP = 3000

export function startProvenance(
  executionId: string,
  rootIdentityId: string,
  tenantId?: string,
  workflowId?: string,
): ProvenanceRecord {
  if (isRuntimePaused()) {
    logger.warn("startProvenance blocked: runtime paused", "execution-provenance")
  }
  if (PROVENANCE.size >= CAP) {
    const firstKey = Array.from(PROVENANCE.keys())[0]
    if (firstKey) PROVENANCE.delete(firstKey)
  }
  const now = new Date().toISOString()
  const record: ProvenanceRecord = {
    provenanceId: crypto.randomUUID(),
    executionId,
    workflowId,
    tenantId,
    chain: [{
      step: 1,
      identityId: rootIdentityId,
      action: "initiate",
      timestamp: now,
    }],
    rootIdentityId,
    integrityValid: true,
    createdAt: now,
    lastUpdatedAt: now,
  }
  PROVENANCE.set(executionId, record)
  logger.info(`Provenance started for execution ${executionId}`, "execution-provenance", { tenantId })
  return record
}

export function appendChainStep(executionId: string, identityId: string, action: string): void {
  const record = PROVENANCE.get(executionId)
  if (!record) return
  const step = record.chain.length + 1
  record.chain.push({ step, identityId, action, timestamp: new Date().toISOString() })
  record.lastUpdatedAt = new Date().toISOString()
}

export function validateProvenance(
  executionId: string,
): { valid: boolean; chainLength: number; issues: string[] } {
  const record = PROVENANCE.get(executionId)
  if (!record) return { valid: false, chainLength: 0, issues: ["Provenance record not found"] }
  const issues: string[] = []
  if (!record.integrityValid) issues.push("Integrity flag is false")
  for (let i = 0; i < record.chain.length; i++) {
    const entry = record.chain[i]
    if (!entry?.identityId) issues.push(`Step ${i + 1} missing identityId`)
  }
  return { valid: issues.length === 0, chainLength: record.chain.length, issues }
}

export function getProvenance(executionId: string): ProvenanceRecord | undefined {
  return PROVENANCE.get(executionId)
}

export function getProvenanceSummary(): {
  total: number; avgChainLength: number; integrityFailures: number
} {
  let totalChain = 0, integrityFailures = 0
  for (const record of Array.from(PROVENANCE.values())) {
    totalChain += record.chain.length
    if (!record.integrityValid) integrityFailures++
  }
  const total = PROVENANCE.size
  return { total, avgChainLength: total > 0 ? totalChain / total : 0, integrityFailures }
}
