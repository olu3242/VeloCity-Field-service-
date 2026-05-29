import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type PayoutOrchestrationPhase =
  | "pending" | "processing" | "completed" | "failed" | "retry_queued" | "refund_initiated"

export interface PayoutOrchestrationRecord {
  recordId: string
  payoutId: string
  providerId: string
  tenantId?: string
  phase: PayoutOrchestrationPhase
  amountCents: number
  currencyCode: string
  stripeTransferId?: string
  retryCount: number
  maxRetries: number
  failureReason?: string
  processedAt?: string
  lastUpdatedAt: string
  createdAt: string
}

const RECORDS: Map<string, PayoutOrchestrationRecord> = new Map()
const RECORDS_CAP = 50000

export function initiatePayout(
  payoutId: string,
  providerId: string,
  amountCents: number,
  currencyCode = "USD",
  tenantId?: string,
): PayoutOrchestrationRecord {
  if (isRuntimePaused()) {
    logger.warn("initiatePayout blocked: runtime paused", "payout-orchestrator", { metadata: { payoutId } })
    throw new Error("Runtime is paused")
  }
  if (RECORDS.size >= RECORDS_CAP) {
    const firstKey = Array.from(RECORDS.keys())[0]
    if (firstKey !== undefined) RECORDS.delete(firstKey)
  }
  const now = new Date().toISOString()
  const record: PayoutOrchestrationRecord = {
    recordId: crypto.randomUUID(),
    payoutId, providerId, tenantId,
    phase: "pending",
    amountCents, currencyCode,
    retryCount: 0, maxRetries: 3,
    lastUpdatedAt: now, createdAt: now,
  }
  RECORDS.set(payoutId, record)
  return record
}

export function processPayout(payoutId: string, stripeTransferId: string): void {
  const record = RECORDS.get(payoutId)
  if (!record) return
  RECORDS.set(payoutId, {
    ...record, phase: "processing", stripeTransferId, lastUpdatedAt: new Date().toISOString(),
  })
}

export function completePayout(payoutId: string): void {
  const record = RECORDS.get(payoutId)
  if (!record) return
  const now = new Date().toISOString()
  RECORDS.set(payoutId, { ...record, phase: "completed", processedAt: now, lastUpdatedAt: now })
}

export function failPayout(payoutId: string, reason: string): void {
  const record = RECORDS.get(payoutId)
  if (!record) return
  const canRetry = record.retryCount < record.maxRetries
  RECORDS.set(payoutId, {
    ...record,
    phase: canRetry ? "retry_queued" : "failed",
    retryCount: canRetry ? record.retryCount + 1 : record.retryCount,
    failureReason: reason,
    lastUpdatedAt: new Date().toISOString(),
  })
}

export function initiateRefund(payoutId: string): void {
  if (isRuntimePaused()) {
    logger.warn("initiateRefund blocked: runtime paused", "payout-orchestrator", { metadata: { payoutId } })
    return
  }
  const record = RECORDS.get(payoutId)
  if (!record) return
  RECORDS.set(payoutId, { ...record, phase: "refund_initiated", lastUpdatedAt: new Date().toISOString() })
}

export function getFailedPayouts(tenantId?: string): PayoutOrchestrationRecord[] {
  return Array.from(RECORDS.values()).filter(
    (r) => r.phase === "failed" && (tenantId === undefined || r.tenantId === tenantId)
  )
}

export function getPayoutSummary(): {
  total: number; byPhase: Record<string, number>; totalAmountCents: number; retryCount: number
} {
  const all = Array.from(RECORDS.values())
  const byPhase: Record<string, number> = {}
  let totalAmountCents = 0; let retryCount = 0
  for (const r of all) {
    byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1
    totalAmountCents += r.amountCents
    retryCount += r.retryCount
  }
  return { total: all.length, byPhase, totalAmountCents, retryCount }
}
