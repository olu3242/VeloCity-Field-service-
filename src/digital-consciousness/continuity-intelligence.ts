export interface ContinuityRecord {
  recordId: string
  continuityType: "planned" | "unplanned" | "degraded" | "partial"
  tenantId?: string
  subsystem?: string
  startedAt: string
  restoredAt?: string
  durationMs?: number
  impactScore: number
  rootCause?: string
  resolutionMethod?: string
}

const RECORDS: ContinuityRecord[] = []
const CAP = 500

export function recordDisruption(
  type: ContinuityRecord["continuityType"],
  impactScore: number,
  subsystem?: string,
  tenantId?: string
): ContinuityRecord {
  if (RECORDS.length >= CAP) RECORDS.shift()
  const record: ContinuityRecord = {
    recordId: crypto.randomUUID(),
    continuityType: type,
    tenantId,
    subsystem,
    impactScore: Math.max(0, Math.min(100, impactScore)),
    startedAt: new Date().toISOString(),
  }
  RECORDS.push(record)
  return record
}

export function restoreService(
  recordId: string,
  rootCause?: string,
  resolutionMethod?: string
): void {
  const r = RECORDS.find(x => x.recordId === recordId)
  if (!r) return
  const now = new Date().toISOString()
  r.restoredAt = now
  r.durationMs = new Date(now).getTime() - new Date(r.startedAt).getTime()
  if (rootCause !== undefined) r.rootCause = rootCause
  if (resolutionMethod !== undefined) r.resolutionMethod = resolutionMethod
}

export function getOpenDisruptions(tenantId?: string): ContinuityRecord[] {
  const open = RECORDS.filter(r => r.restoredAt === undefined)
  return tenantId ? open.filter(r => r.tenantId === tenantId) : open
}

export function getMTTR(): number {
  const resolved = RECORDS.filter(r => r.durationMs !== undefined)
  if (resolved.length === 0) return 0
  const total = resolved.reduce((sum, r) => sum + (r.durationMs ?? 0), 0)
  return total / resolved.length
}

export function getContinuitySummary(): {
  total: number
  open: number
  resolved: number
  avgDurationMs: number
  avgImpactScore: number
} {
  const resolved = RECORDS.filter(r => r.restoredAt !== undefined)
  const open = RECORDS.filter(r => r.restoredAt === undefined)
  const totalDuration = resolved.reduce((sum, r) => sum + (r.durationMs ?? 0), 0)
  const totalImpact = RECORDS.reduce((sum, r) => sum + r.impactScore, 0)
  return {
    total: RECORDS.length,
    open: open.length,
    resolved: resolved.length,
    avgDurationMs: resolved.length > 0 ? totalDuration / resolved.length : 0,
    avgImpactScore: RECORDS.length > 0 ? totalImpact / RECORDS.length : 0,
  }
}
