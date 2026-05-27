import { isRuntimePaused } from "@/lib/governance/operator"

export interface PayoutInstruction {
  id: string
  tenantId: string
  providerId: string
  amount: number
  currency: string
  status: "pending" | "approved" | "processing" | "completed" | "failed" | "cancelled"
  scheduledAt: string
  processedAt?: string
  failureReason?: string
  retryCount: number
}

const PAYOUTS: PayoutInstruction[] = []
const PAYOUTS_CAP = 2000

export function schedulePayout(
  tenantId: string,
  providerId: string,
  amount: number,
  currency = "USD",
  scheduledAt?: string,
): PayoutInstruction {
  if (isRuntimePaused()) {
    throw new Error("Runtime is paused — payouts blocked")
  }
  const payout: PayoutInstruction = {
    id: crypto.randomUUID(),
    tenantId,
    providerId,
    amount,
    currency,
    status: "pending",
    scheduledAt: scheduledAt ?? new Date().toISOString(),
    retryCount: 0,
  }
  PAYOUTS.push(payout)
  if (PAYOUTS.length > PAYOUTS_CAP) PAYOUTS.splice(0, PAYOUTS.length - PAYOUTS_CAP)
  return payout
}

export function approvePayout(id: string): void {
  const p = PAYOUTS.find((x) => x.id === id)
  if (!p) return
  p.status = "approved"
}

export function processPayout(id: string): void {
  const p = PAYOUTS.find((x) => x.id === id)
  if (!p) return
  p.status = "processing"
  p.processedAt = new Date().toISOString()
}

export function failPayout(id: string, reason: string): void {
  const p = PAYOUTS.find((x) => x.id === id)
  if (!p) return
  p.status = "failed"
  p.failureReason = reason
  p.retryCount++
}

export function getPendingPayouts(tenantId?: string): PayoutInstruction[] {
  return PAYOUTS.filter(
    (p) =>
      (p.status === "pending" || p.status === "approved") &&
      (tenantId === undefined || p.tenantId === tenantId),
  )
}

export function getPayoutStats(tenantId?: string): {
  total: number
  successRate: number
  avgAmount: number
  totalVolume: number
} {
  const filtered = tenantId ? PAYOUTS.filter((p) => p.tenantId === tenantId) : PAYOUTS
  const done = filtered.filter((p) => p.status === "completed" || p.status === "failed")
  const completed = filtered.filter((p) => p.status === "completed")
  const successRate = done.length > 0 ? completed.length / done.length : 0
  const totalVolume = filtered.reduce((s, p) => s + p.amount, 0)
  const avgAmount = filtered.length > 0 ? totalVolume / filtered.length : 0
  return { total: filtered.length, successRate, avgAmount, totalVolume }
}
