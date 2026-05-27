export interface CostOptimizationRecord {
  id: string
  tenantId?: string
  category: "ai_calls" | "queue_overhead" | "retry_waste" | "idle_workers"
  wasteUsd: number
  optimizedUsd: number
  savingsUsd: number
  technique: string
  identifiedAt: string
  applied: boolean
}

const RECORDS: CostOptimizationRecord[] = []
const CAP = 200

export function identifyCostWaste(
  category: CostOptimizationRecord["category"],
  wasteUsd: number,
  technique: string,
  tenantId?: string
): CostOptimizationRecord {
  const optimizedUsd = wasteUsd * 0.4
  const savingsUsd = wasteUsd - optimizedUsd

  const record: CostOptimizationRecord = {
    id: crypto.randomUUID(),
    tenantId,
    category,
    wasteUsd,
    optimizedUsd,
    savingsUsd,
    technique,
    identifiedAt: new Date().toISOString(),
    applied: false,
  }

  if (RECORDS.length >= CAP) RECORDS.shift()
  RECORDS.push(record)
  return record
}

export function applyOptimization(id: string): void {
  const record = RECORDS.find(r => r.id === id)
  if (record) record.applied = true
}

export function getTotalSavings(tenantId?: string): number {
  return RECORDS
    .filter(r => r.applied && (tenantId === undefined || r.tenantId === tenantId))
    .reduce((s, r) => s + r.savingsUsd, 0)
}

export function getCostOptimizationSummary(): {
  identified: number
  applied: number
  totalWasteUsd: number
  totalSavingsUsd: number
} {
  const applied = RECORDS.filter(r => r.applied)
  return {
    identified: RECORDS.length,
    applied: applied.length,
    totalWasteUsd: RECORDS.reduce((s, r) => s + r.wasteUsd, 0),
    totalSavingsUsd: applied.reduce((s, r) => s + r.savingsUsd, 0),
  }
}
