export type MarketplaceCategory =
  | "workflow_template"
  | "orchestration_extension"
  | "ai_operator"
  | "federation_adapter"
  | "telemetry_plugin"
  | "governance_rule"
  | "queue_processor"
  | "runtime_capability"

export type MarketplaceItemStatus = "published" | "draft" | "deprecated" | "suspended"

export interface MarketplaceItem {
  itemId: string
  name: string
  description: string
  category: MarketplaceCategory
  status: MarketplaceItemStatus
  version: string
  authorId: string
  authorName: string
  tenantId?: string
  tenantSafe: boolean
  pricingModel: "free" | "per_use" | "subscription" | "enterprise"
  priceUsdCents?: number
  downloadCount: number
  rating: number
  ratingCount: number
  tags: string[]
  publishedAt?: string
  createdAt: string
}

export function createMarketplaceItem(
  name: string,
  category: MarketplaceCategory,
  authorId: string,
  authorName: string,
  options?: Partial<
    Pick<
      MarketplaceItem,
      | "description"
      | "version"
      | "tenantId"
      | "tenantSafe"
      | "pricingModel"
      | "priceUsdCents"
      | "tags"
      | "status"
      | "rating"
      | "ratingCount"
      | "downloadCount"
    >
  >
): MarketplaceItem {
  return {
    itemId: crypto.randomUUID(),
    name,
    category,
    authorId,
    authorName,
    description: options?.description ?? "",
    version: options?.version ?? "1.0.0",
    status: options?.status ?? "draft",
    tenantId: options?.tenantId,
    tenantSafe: options?.tenantSafe ?? true,
    pricingModel: options?.pricingModel ?? "free",
    priceUsdCents: options?.priceUsdCents,
    downloadCount: options?.downloadCount ?? 0,
    rating: options?.rating ?? 0,
    ratingCount: options?.ratingCount ?? 0,
    tags: options?.tags ?? [],
    createdAt: new Date().toISOString(),
  }
}
