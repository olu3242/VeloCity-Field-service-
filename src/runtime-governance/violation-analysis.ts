import { logger } from "@/runtime-core/observability"
import { type ConstitutionPrinciple } from "./runtime-constitution"

export type ViolationSeverity = "minor" | "moderate" | "major" | "critical"

export interface GovernanceViolation {
  violationId: string
  entityId: string
  entityType: string
  tenantId?: string
  principle: ConstitutionPrinciple
  policyId?: string
  severity: ViolationSeverity
  description: string
  detectedAt: string
  resolvedAt?: string
  autoRemediated: boolean
  resolution?: string
}

const VIOLATIONS: GovernanceViolation[] = []
const VIOLATIONS_CAP = 2000

export function recordViolation(
  entityId: string,
  entityType: string,
  principle: ConstitutionPrinciple,
  severity: ViolationSeverity,
  description: string,
  tenantId?: string,
  policyId?: string
): GovernanceViolation {
  if (VIOLATIONS.length >= VIOLATIONS_CAP) VIOLATIONS.shift()
  const violation: GovernanceViolation = {
    violationId: crypto.randomUUID(),
    entityId,
    entityType,
    tenantId,
    principle,
    policyId,
    severity,
    description,
    detectedAt: new Date().toISOString(),
    autoRemediated: false,
  }
  VIOLATIONS.push(violation)
  logger.warn(`Violation recorded: ${principle} (${severity})`, "violation-analysis", {
    metadata: { violationId: violation.violationId, entityId },
  })
  return violation
}

export function resolveViolation(
  violationId: string,
  resolution: string,
  autoRemediated = false
): void {
  const violation = VIOLATIONS.find((v) => v.violationId === violationId)
  if (!violation) return
  violation.resolvedAt = new Date().toISOString()
  violation.resolution = resolution
  violation.autoRemediated = autoRemediated
}

export function getOpenViolations(tenantId?: string): GovernanceViolation[] {
  return VIOLATIONS.filter(
    (v) => v.resolvedAt === undefined && (tenantId === undefined || v.tenantId === tenantId)
  )
}

export function getViolationsByPrinciple(principle: ConstitutionPrinciple): GovernanceViolation[] {
  return VIOLATIONS.filter((v) => v.principle === principle)
}

export function getViolationSummary(): {
  total: number
  open: number
  resolved: number
  autoRemediated: number
  bySeverity: Record<string, number>
  byPrinciple: Record<string, number>
} {
  const bySeverity: Record<string, number> = {}
  const byPrinciple: Record<string, number> = {}
  let open = 0
  let resolved = 0
  let autoRemediated = 0
  for (const v of VIOLATIONS) {
    bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1
    byPrinciple[v.principle] = (byPrinciple[v.principle] ?? 0) + 1
    if (v.resolvedAt !== undefined) {
      resolved++
      if (v.autoRemediated) autoRemediated++
    } else {
      open++
    }
  }
  return { total: VIOLATIONS.length, open, resolved, autoRemediated, bySeverity, byPrinciple }
}
