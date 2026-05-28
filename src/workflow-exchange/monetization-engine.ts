import { logger } from "@/runtime-core/observability"

export type MonetizationModel = "free" | "per_use" | "subscription" | "enterprise_license"

export interface UsageCharge {
  chargeId: string
  assetId: string
  tenantId: string
  model: MonetizationModel
  quantity: number
  unitPriceUsdCents: number
  totalUsdCents: number
  billingPeriod?: string
  chargedAt: string
  status: "pending" | "invoiced" | "paid" | "waived"
}

const CHARGES: UsageCharge[] = []
const CHARGES_CAP = 5000

export function recordCharge(
  assetId: string,
  tenantId: string,
  model: MonetizationModel,
  quantity: number,
  unitPriceUsdCents: number,
  options?: { billingPeriod?: string }
): UsageCharge {
  if (CHARGES.length >= CHARGES_CAP) CHARGES.shift()
  const charge: UsageCharge = {
    chargeId: crypto.randomUUID(),
    assetId,
    tenantId,
    model,
    quantity,
    unitPriceUsdCents,
    totalUsdCents: quantity * unitPriceUsdCents,
    billingPeriod: options?.billingPeriod,
    chargedAt: new Date().toISOString(),
    status: "pending",
  }
  CHARGES.push(charge)
  logger.info(`Charge recorded: ${charge.totalUsdCents}¢`, "monetization-engine", {
    metadata: { chargeId: charge.chargeId, tenantId, model },
  })
  return charge
}

export function markInvoiced(chargeId: string): void {
  const charge = CHARGES.find((c) => c.chargeId === chargeId)
  if (!charge) return
  charge.status = "invoiced"
}

export function markPaid(chargeId: string): void {
  const charge = CHARGES.find((c) => c.chargeId === chargeId)
  if (!charge) return
  charge.status = "paid"
}

export function getPendingCharges(tenantId?: string): UsageCharge[] {
  return CHARGES.filter(
    (c) => c.status === "pending" && (tenantId === undefined || c.tenantId === tenantId)
  )
}

export function getRevenueSummary(): {
  totalChargedUsdCents: number
  pendingUsdCents: number
  paidUsdCents: number
  byModel: Record<string, number>
} {
  const byModel: Record<string, number> = {}
  let totalChargedUsdCents = 0
  let pendingUsdCents = 0
  let paidUsdCents = 0
  for (const c of CHARGES) {
    totalChargedUsdCents += c.totalUsdCents
    if (c.status === "pending") pendingUsdCents += c.totalUsdCents
    if (c.status === "paid") paidUsdCents += c.totalUsdCents
    byModel[c.model] = (byModel[c.model] ?? 0) + c.totalUsdCents
  }
  return { totalChargedUsdCents, pendingUsdCents, paidUsdCents, byModel }
}
