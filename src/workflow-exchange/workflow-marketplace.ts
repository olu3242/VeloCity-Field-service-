import { logger } from "@/runtime-core/observability"
import { type ExchangeAsset, type ExchangeAssetType } from "./exchange-registry"

export type { ExchangeAssetType }

export interface MarketplaceSearchQuery {
  assetType?: ExchangeAssetType
  tags?: string[]
  tenantSafe?: boolean
  minRating?: number
  query?: string
}

export interface MarketplaceSearchResult {
  assets: ExchangeAsset[]
  total: number
  searchedAt: string
}

// Registry accessor injected by the barrel index to avoid circular deps
let _getAllAssets: (() => ExchangeAsset[]) = () => []

export function _injectRegistryAccessor(fn: () => ExchangeAsset[]): void {
  _getAllAssets = fn
}

function getPublishedAssets(): ExchangeAsset[] {
  return _getAllAssets().filter((a) => a.status === "published")
}

export function searchMarketplace(
  query: MarketplaceSearchQuery,
  limit = 50
): MarketplaceSearchResult {
  logger.debug("Marketplace search", "workflow-marketplace", { metadata: { query } })
  const lowerQ = query.query?.toLowerCase()
  const results = getPublishedAssets()
    .filter((a) => {
      if (query.assetType !== undefined && a.assetType !== query.assetType) return false
      if (query.tenantSafe !== undefined && a.tenantSafe !== query.tenantSafe) return false
      if (query.minRating !== undefined && a.ratingAvg < query.minRating) return false
      if (lowerQ !== undefined && !a.name.toLowerCase().includes(lowerQ)) return false
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.every((t) => a.tags.includes(t))) return false
      }
      return true
    })
    .sort((x, y) => y.downloadCount - x.downloadCount)
    .slice(0, limit)
  return { assets: results, total: results.length, searchedAt: new Date().toISOString() }
}

export function getFeaturedAssets(limit = 10): ExchangeAsset[] {
  return getPublishedAssets()
    .sort((x, y) => y.ratingAvg * y.ratingCount - x.ratingAvg * x.ratingCount)
    .slice(0, limit)
}

export function getNewArrivals(limit = 10): ExchangeAsset[] {
  return getPublishedAssets()
    .filter((a) => a.publishedAt !== undefined)
    .sort((x, y) => (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""))
    .slice(0, limit)
}

export function getTrendingAssets(limit = 10): ExchangeAsset[] {
  return getPublishedAssets()
    .sort((x, y) => y.downloadCount - x.downloadCount)
    .slice(0, limit)
}
