export interface UsageRecord {
  id: string
  tenantId: string
  metricType: "ai_calls" | "events_processed" | "workflows_run" | "storage_gb" | "api_requests"
  quantity: number
  unitCostUsd: number
  totalCostUsd: number
  billingPeriod: string
  recordedAt: string
}

const USAGE: UsageRecord[] = []
const USAGE_CAP = 5000

export function recordUsage(
  tenantId: string,
  metricType: UsageRecord["metricType"],
  quantity: number,
  unitCostUsd: number,
): UsageRecord {
  const record: UsageRecord = {
    id: crypto.randomUUID(),
    tenantId,
    metricType,
    quantity,
    unitCostUsd,
    totalCostUsd: quantity * unitCostUsd,
    billingPeriod: new Date().toISOString().slice(0, 7),
    recordedAt: new Date().toISOString(),
  }
  USAGE.push(record)
  if (USAGE.length > USAGE_CAP) USAGE.splice(0, USAGE.length - USAGE_CAP)
  return record
}

export function getTenantUsage(tenantId: string, billingPeriod?: string): UsageRecord[] {
  return USAGE.filter(
    (r) => r.tenantId === tenantId && (billingPeriod === undefined || r.billingPeriod === billingPeriod),
  )
}

export function getTenantBill(
  tenantId: string,
  billingPeriod: string,
): { tenantId: string; period: string; totalCostUsd: number; breakdown: Record<string, number> } {
  const records = getTenantUsage(tenantId, billingPeriod)
  const breakdown: Record<string, number> = {}
  let totalCostUsd = 0
  for (const r of records) {
    breakdown[r.metricType] = (breakdown[r.metricType] ?? 0) + r.totalCostUsd
    totalCostUsd += r.totalCostUsd
  }
  return { tenantId, period: billingPeriod, totalCostUsd, breakdown }
}

export function getTopSpendingTenants(limit = 10): { tenantId: string; totalCostUsd: number }[] {
  const totals: Map<string, number> = new Map()
  for (const r of USAGE) {
    totals.set(r.tenantId, (totals.get(r.tenantId) ?? 0) + r.totalCostUsd)
  }
  return Array.from(totals.entries())
    .map(([tenantId, totalCostUsd]) => ({ tenantId, totalCostUsd }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, limit)
}

export function getPlatformRevenue(billingPeriod: string): number {
  return USAGE
    .filter((r) => r.billingPeriod === billingPeriod)
    .reduce((s, r) => s + r.totalCostUsd, 0)
}
