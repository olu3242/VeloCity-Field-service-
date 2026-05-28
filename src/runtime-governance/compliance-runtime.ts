import { logger } from "@/runtime-core/observability"
import { type ConstitutionPrinciple } from "./runtime-constitution"

export type ComplianceStatus = "compliant" | "warning" | "violation" | "critical_violation" | "unknown"

export interface ComplianceRecord {
  recordId: string
  entityId: string
  entityType: "workflow" | "tenant" | "subsystem" | "execution"
  tenantId?: string
  status: ComplianceStatus
  score: number
  activeViolations: number
  lastCheckedAt: string
  checkedByPrinciples: ConstitutionPrinciple[]
}

const COMPLIANCE: Map<string, ComplianceRecord> = new Map()
const COMPLIANCE_CAP = 2000

export function createComplianceRecord(
  entityId: string,
  entityType: ComplianceRecord["entityType"],
  principles: ConstitutionPrinciple[],
  tenantId?: string
): ComplianceRecord {
  if (COMPLIANCE.size >= COMPLIANCE_CAP) {
    const firstKey = Array.from(COMPLIANCE.keys())[0]
    if (firstKey !== undefined) COMPLIANCE.delete(firstKey)
  }
  const record: ComplianceRecord = {
    recordId: crypto.randomUUID(),
    entityId,
    entityType,
    tenantId,
    status: "unknown",
    score: 100,
    activeViolations: 0,
    lastCheckedAt: new Date().toISOString(),
    checkedByPrinciples: principles,
  }
  COMPLIANCE.set(entityId, record)
  logger.info(`Compliance record created: ${entityId}`, "compliance-runtime", {
    metadata: { entityType, recordId: record.recordId },
  })
  return record
}

export function updateComplianceStatus(
  entityId: string,
  status: ComplianceStatus,
  score: number,
  violations: number
): void {
  const record = COMPLIANCE.get(entityId)
  if (!record) return
  record.status = status
  record.score = Math.max(0, Math.min(100, score))
  record.activeViolations = violations
  record.lastCheckedAt = new Date().toISOString()
}

export function getComplianceScore(entityId: string): number | undefined {
  return COMPLIANCE.get(entityId)?.score
}

export function getViolatingEntities(tenantId?: string): ComplianceRecord[] {
  return Array.from(COMPLIANCE.values()).filter(
    (r) =>
      (r.status === "violation" || r.status === "critical_violation") &&
      (tenantId === undefined || r.tenantId === tenantId)
  )
}

export function getComplianceSummary(): {
  total: number
  byStatus: Record<string, number>
  avgScore: number
  criticalCount: number
} {
  const byStatus: Record<string, number> = {}
  let scoreSum = 0
  let criticalCount = 0
  const records = Array.from(COMPLIANCE.values())
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    scoreSum += r.score
    if (r.status === "critical_violation") criticalCount++
  }
  const avgScore = records.length > 0 ? scoreSum / records.length : 0
  return { total: COMPLIANCE.size, byStatus, avgScore, criticalCount }
}
