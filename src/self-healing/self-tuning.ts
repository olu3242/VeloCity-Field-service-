import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface TuningRecord {
  tuningId: string
  parameterId: string
  tenantId?: string
  currentValue: number
  proposedValue: number
  delta: number
  confidence: number
  safeToApply: boolean
  appliedAt?: string
  rollbackAt?: string
  tunedAt: string
}

const TUNING_PARAMS = new Map<string, number>()
const RECORDS: TuningRecord[] = []
const TUNING_PARAMS_CAP = 200
const RECORDS_CAP = 500

export function proposeAdjustment(
  parameterId: string,
  currentValue: number,
  proposedValue: number,
  confidence: number,
  tenantId?: string
): TuningRecord {
  const delta = proposedValue - currentValue
  const relativeChange = Math.abs(delta / Math.max(1, currentValue))
  const safeToApply = confidence >= 0.7 && relativeChange <= 0.2

  const record: TuningRecord = {
    tuningId: crypto.randomUUID(),
    parameterId,
    tenantId,
    currentValue,
    proposedValue,
    delta,
    confidence,
    safeToApply,
    tunedAt: new Date().toISOString(),
  }
  RECORDS.push(record)
  if (RECORDS.length > RECORDS_CAP) RECORDS.splice(0, RECORDS.length - RECORDS_CAP)
  return record
}

export function applyAdjustment(tuningId: string): void {
  if (isRuntimePaused()) {
    logger.warn("applyAdjustment blocked: runtime paused")
    return
  }
  const record = RECORDS.find((r) => r.tuningId === tuningId)
  if (!record) return
  if (TUNING_PARAMS.size >= TUNING_PARAMS_CAP && !TUNING_PARAMS.has(record.parameterId)) {
    const firstKey = Array.from(TUNING_PARAMS.keys())[0]
    if (firstKey !== undefined) TUNING_PARAMS.delete(firstKey)
  }
  TUNING_PARAMS.set(record.parameterId, record.proposedValue)
  record.appliedAt = new Date().toISOString()
}

export function rollbackAdjustment(tuningId: string): void {
  const record = RECORDS.find((r) => r.tuningId === tuningId)
  if (!record) return
  TUNING_PARAMS.set(record.parameterId, record.currentValue)
  record.rollbackAt = new Date().toISOString()
}

export function getCurrentValue(parameterId: string): number | undefined {
  return TUNING_PARAMS.get(parameterId)
}

export function getTuningSummary(): {
  total: number
  applied: number
  rolled_back: number
  avgDelta: number
} {
  const total = RECORDS.length
  const applied = RECORDS.filter((r) => r.appliedAt !== undefined).length
  const rolled_back = RECORDS.filter((r) => r.rollbackAt !== undefined).length
  const avgDelta = total > 0 ? RECORDS.reduce((s, r) => s + r.delta, 0) / total : 0
  return { total, applied, rolled_back, avgDelta }
}
