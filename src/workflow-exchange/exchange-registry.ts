import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ExchangeAssetType =
  | "workflow_template"
  | "orchestration_extension"
  | "ai_operator"
  | "execution_blueprint"
  | "runtime_pack"
  | "governance_rule_set"
  | "federation_adapter"

export type ExchangeAssetStatus = "draft" | "published" | "deprecated" | "suspended" | "archived"

export interface ExchangeAsset {
  assetId: string
  name: string
  assetType: ExchangeAssetType
  status: ExchangeAssetStatus
  version: string
  publisherId: string
  tenantId?: string
  tenantSafe: boolean
  signatureHash: string
  downloadCount: number
  ratingAvg: number
  ratingCount: number
  tags: string[]
  publishedAt?: string
  createdAt: string
}

const REGISTRY: Map<string, ExchangeAsset> = new Map()
const REGISTRY_CAP = 3000

export function registerAsset(
  name: string,
  assetType: ExchangeAssetType,
  publisherId: string,
  options?: Partial<Pick<ExchangeAsset, "version" | "tenantId" | "tenantSafe" | "tags">>
): ExchangeAsset {
  if (REGISTRY.size >= REGISTRY_CAP) {
    const firstKey = Array.from(REGISTRY.keys())[0]
    if (firstKey !== undefined) REGISTRY.delete(firstKey)
  }
  const asset: ExchangeAsset = {
    assetId: crypto.randomUUID(),
    name,
    assetType,
    status: "draft",
    version: options?.version ?? "1.0.0",
    publisherId,
    tenantId: options?.tenantId,
    tenantSafe: options?.tenantSafe ?? true,
    signatureHash: crypto.randomUUID(),
    downloadCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    tags: options?.tags ?? [],
    createdAt: new Date().toISOString(),
  }
  REGISTRY.set(asset.assetId, asset)
  logger.info(`Asset registered: ${name}`, "exchange-registry", { metadata: { assetId: asset.assetId } })
  return asset
}

export function publishAsset(assetId: string): void {
  if (isRuntimePaused()) {
    logger.warn("publishAsset blocked: runtime paused", "exchange-registry")
    return
  }
  const asset = REGISTRY.get(assetId)
  if (!asset) return
  asset.status = "published"
  asset.publishedAt = new Date().toISOString()
}

export function suspendAsset(assetId: string): void {
  if (isRuntimePaused()) {
    logger.warn("suspendAsset blocked: runtime paused", "exchange-registry")
    return
  }
  const asset = REGISTRY.get(assetId)
  if (!asset) return
  asset.status = "suspended"
}

export function deprecateAsset(assetId: string): void {
  const asset = REGISTRY.get(assetId)
  if (!asset) return
  asset.status = "deprecated"
}

export function getAsset(assetId: string): ExchangeAsset | undefined {
  return REGISTRY.get(assetId)
}

export function recordDownload(assetId: string): void {
  const asset = REGISTRY.get(assetId)
  if (!asset) return
  asset.downloadCount++
}

export function submitRating(assetId: string, rating: number): void {
  const asset = REGISTRY.get(assetId)
  if (!asset) return
  const clamped = Math.max(1, Math.min(5, rating))
  asset.ratingAvg = (asset.ratingAvg * asset.ratingCount + clamped) / (asset.ratingCount + 1)
  asset.ratingCount++
}

export function _getAllAssets(): ExchangeAsset[] {
  return Array.from(REGISTRY.values())
}

export function getRegistryStats(): { total: number; published: number; byType: Record<string, number>; totalDownloads: number } {
  const byType: Record<string, number> = {}
  let published = 0
  let totalDownloads = 0
  for (const asset of Array.from(REGISTRY.values())) {
    byType[asset.assetType] = (byType[asset.assetType] ?? 0) + 1
    if (asset.status === "published") published++
    totalDownloads += asset.downloadCount
  }
  return { total: REGISTRY.size, published, byType, totalDownloads }
}
