import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { createMarketplaceItem, type MarketplaceCategory, type MarketplaceItem } from "./marketplace-item"

const CATALOG: Map<string, MarketplaceItem> = new Map()
const CATALOG_CAP = 2000

function seed(): void {
  const platform = "platform"
  const items: Array<[string, MarketplaceCategory, string]> = [
    ["Standard Approval Workflow", "workflow_template", "Canonical multi-step approval workflow for service requests"],
    ["Circuit Breaker Monitor", "telemetry_plugin", "Monitors and reports circuit breaker state across services"],
    ["Multi-Region Federation Adapter", "federation_adapter", "Adapts cross-region federation for distributed deployments"],
    ["AI Anomaly Scorer", "ai_operator", "AI-driven anomaly detection and scoring for runtime events"],
    ["Compliance Audit Rule", "governance_rule", "Enforces compliance audit trails on all mutable operations"],
    ["Priority Queue Processor", "queue_processor", "Processes queued jobs with configurable priority tiers"],
  ]
  for (const [name, category, description] of items) {
    const item = createMarketplaceItem(name, category, platform, "VeloCity Platform", {
      description,
      status: "published",
      tenantSafe: true,
      pricingModel: "free",
      tags: [category, "platform", "core"],
      downloadCount: Math.floor(Math.random() * 500) + 100,
      rating: 4.5,
      ratingCount: 42,
    })
    item.publishedAt = new Date().toISOString()
    CATALOG.set(item.itemId, item)
  }
}

seed()

export function publishItem(item: MarketplaceItem): void {
  if (isRuntimePaused()) throw new Error("Runtime is paused — cannot publish marketplace item")
  if (CATALOG.size >= CATALOG_CAP) {
    const firstKey = Array.from(CATALOG.keys())[0]
    if (firstKey) CATALOG.delete(firstKey)
  }
  item.status = "published"
  item.publishedAt = new Date().toISOString()
  CATALOG.set(item.itemId, item)
  logger.info(`Marketplace item published: ${item.name}`, "catalog", { metadata: { itemId: item.itemId } })
}

export function deprecateItem(itemId: string): void {
  const item = CATALOG.get(itemId)
  if (!item) throw new Error(`Item not found: ${itemId}`)
  item.status = "deprecated"
}

export function suspendItem(itemId: string): void {
  const item = CATALOG.get(itemId)
  if (!item) throw new Error(`Item not found: ${itemId}`)
  item.status = "suspended"
}

export function getItem(itemId: string): MarketplaceItem | undefined {
  return CATALOG.get(itemId)
}

export function searchCatalog(query: {
  category?: MarketplaceCategory
  tags?: string[]
  pricingModel?: MarketplaceItem["pricingModel"]
  tenantSafe?: boolean
}): MarketplaceItem[] {
  return Array.from(CATALOG.values()).filter((item) => {
    if (item.status !== "published") return false
    if (query.category && item.category !== query.category) return false
    if (query.pricingModel && item.pricingModel !== query.pricingModel) return false
    if (query.tenantSafe !== undefined && item.tenantSafe !== query.tenantSafe) return false
    if (query.tags && query.tags.length > 0) {
      const hasAll = query.tags.every((t) => item.tags.includes(t))
      if (!hasAll) return false
    }
    return true
  })
}

export function getTopItems(category?: MarketplaceCategory, limit = 10): MarketplaceItem[] {
  return Array.from(CATALOG.values())
    .filter((item) => item.status === "published" && (category === undefined || item.category === category))
    .sort((a, b) => b.downloadCount - a.downloadCount)
    .slice(0, limit)
}

export function getCatalogStats(): {
  total: number
  byCategory: Record<string, number>
  byPricing: Record<string, number>
  totalDownloads: number
} {
  const byCategory: Record<string, number> = {}
  const byPricing: Record<string, number> = {}
  let totalDownloads = 0
  for (const item of Array.from(CATALOG.values())) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
    byPricing[item.pricingModel] = (byPricing[item.pricingModel] ?? 0) + 1
    totalDownloads += item.downloadCount
  }
  return { total: CATALOG.size, byCategory, byPricing, totalDownloads }
}

export { CATALOG }
