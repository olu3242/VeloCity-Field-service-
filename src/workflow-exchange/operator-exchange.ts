import { logger } from "@/runtime-core/observability"

export interface AIOperatorListing {
  listingId: string
  operatorName: string
  operatorType: string
  publisherId: string
  tenantId?: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  avgConfidence: number
  invocationCount: number
  pricingModel: "free" | "per_call" | "subscription"
  priceUsdCents?: number
  status: "available" | "deprecated" | "experimental"
  publishedAt: string
}

const LISTINGS: Map<string, AIOperatorListing> = new Map()
const LISTINGS_CAP = 500

export function listOperator(
  operatorName: string,
  operatorType: string,
  publisherId: string,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  options?: Partial<Pick<AIOperatorListing, "tenantId" | "pricingModel" | "priceUsdCents" | "status">>
): AIOperatorListing {
  if (LISTINGS.size >= LISTINGS_CAP) {
    const firstKey = Array.from(LISTINGS.keys())[0]
    if (firstKey !== undefined) LISTINGS.delete(firstKey)
  }
  const listing: AIOperatorListing = {
    listingId: crypto.randomUUID(),
    operatorName,
    operatorType,
    publisherId,
    tenantId: options?.tenantId,
    inputSchema,
    outputSchema,
    avgConfidence: 0,
    invocationCount: 0,
    pricingModel: options?.pricingModel ?? "free",
    priceUsdCents: options?.priceUsdCents,
    status: options?.status ?? "available",
    publishedAt: new Date().toISOString(),
  }
  LISTINGS.set(listing.listingId, listing)
  logger.info(`Operator listed: ${operatorName}`, "operator-exchange", { metadata: { listingId: listing.listingId } })
  return listing
}

export function deprecateOperator(listingId: string): void {
  const listing = LISTINGS.get(listingId)
  if (!listing) return
  listing.status = "deprecated"
  logger.info(`Operator deprecated: ${listingId}`, "operator-exchange")
}

export function recordInvocation(listingId: string, confidence: number): void {
  const listing = LISTINGS.get(listingId)
  if (!listing) return
  const clamped = Math.max(0, Math.min(1, confidence))
  listing.avgConfidence =
    (listing.avgConfidence * listing.invocationCount + clamped) / (listing.invocationCount + 1)
  listing.invocationCount++
}

export function getAvailableOperators(operatorType?: string): AIOperatorListing[] {
  return Array.from(LISTINGS.values()).filter(
    (l) => l.status === "available" && (operatorType === undefined || l.operatorType === operatorType)
  )
}

export function getOperatorStats(): {
  total: number
  available: number
  deprecated: number
  byType: Record<string, number>
  totalInvocations: number
} {
  const byType: Record<string, number> = {}
  let available = 0
  let deprecated = 0
  let totalInvocations = 0
  for (const l of Array.from(LISTINGS.values())) {
    byType[l.operatorType] = (byType[l.operatorType] ?? 0) + 1
    if (l.status === "available") available++
    if (l.status === "deprecated") deprecated++
    totalInvocations += l.invocationCount
  }
  return { total: LISTINGS.size, available, deprecated, byType, totalInvocations }
}
