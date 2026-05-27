export interface CommissionRecord {
  id: string
  tenantId: string
  providerId: string
  transactionAmount: number
  commissionRate: number
  commissionAmount: number
  tier: "standard" | "premium" | "enterprise"
  recordedAt: string
}

const COMMISSIONS: CommissionRecord[] = []
const COMMISSION_CAP = 2000

const RATES: Record<string, number> = { standard: 0.15, premium: 0.12, enterprise: 0.10 }

export function recordCommission(
  tenantId: string,
  providerId: string,
  transactionAmount: number,
  tier: CommissionRecord["tier"],
): CommissionRecord {
  const commissionRate = RATES[tier] ?? 0.15
  const record: CommissionRecord = {
    id: crypto.randomUUID(),
    tenantId,
    providerId,
    transactionAmount,
    commissionRate,
    commissionAmount: transactionAmount * commissionRate,
    tier,
    recordedAt: new Date().toISOString(),
  }
  COMMISSIONS.push(record)
  if (COMMISSIONS.length > COMMISSION_CAP) COMMISSIONS.splice(0, COMMISSIONS.length - COMMISSION_CAP)
  return record
}

export function getTenantCommissions(tenantId: string, limit?: number): CommissionRecord[] {
  const filtered = COMMISSIONS.filter((c) => c.tenantId === tenantId)
  return limit !== undefined ? filtered.slice(-limit) : filtered
}

export function getCommissionSummary(tenantId?: string): {
  totalCommissions: number
  totalAmount: number
  avgRate: number
} {
  const filtered = tenantId ? COMMISSIONS.filter((c) => c.tenantId === tenantId) : COMMISSIONS
  const totalCommissions = filtered.length
  const totalAmount = filtered.reduce((s, c) => s + c.commissionAmount, 0)
  const avgRate = totalCommissions > 0 ? filtered.reduce((s, c) => s + c.commissionRate, 0) / totalCommissions : 0
  return { totalCommissions, totalAmount, avgRate }
}

export function getCommissionsByTier(): Record<string, { count: number; totalAmount: number }> {
  const result: Record<string, { count: number; totalAmount: number }> = {}
  for (const c of COMMISSIONS) {
    if (!result[c.tier]) result[c.tier] = { count: 0, totalAmount: 0 }
    result[c.tier].count++
    result[c.tier].totalAmount += c.commissionAmount
  }
  return result
}
