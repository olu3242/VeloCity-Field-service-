import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { CATALOG } from "./catalog"

export interface Installation {
  installationId: string
  itemId: string
  tenantId: string
  installedVersion: string
  installedBy: string
  installedAt: string
  status: "active" | "disabled" | "uninstalled" | "error"
  lastUsedAt?: string
  usageCount: number
  errorMessage?: string
}

const INSTALLATIONS: Map<string, Installation[]> = new Map()
const INSTALLATIONS_CAP = 5000

function totalCount(): number {
  return Array.from(INSTALLATIONS.values()).reduce((sum, arr) => sum + arr.length, 0)
}

function enforceCapWithEviction(): void {
  if (totalCount() < INSTALLATIONS_CAP) return
  const firstKey = Array.from(INSTALLATIONS.keys())[0]
  if (!firstKey) return
  const arr = INSTALLATIONS.get(firstKey)
  if (!arr || arr.length === 0) { INSTALLATIONS.delete(firstKey); return }
  arr.shift()
  if (arr.length === 0) INSTALLATIONS.delete(firstKey)
}

export function installItem(
  itemId: string,
  installedVersion: string,
  tenantId: string,
  installedBy: string
): Installation {
  if (isRuntimePaused()) throw new Error("Runtime is paused — cannot install item")
  enforceCapWithEviction()

  const installation: Installation = {
    installationId: crypto.randomUUID(),
    itemId,
    tenantId,
    installedVersion,
    installedBy,
    installedAt: new Date().toISOString(),
    status: "active",
    usageCount: 0,
  }

  const existing = INSTALLATIONS.get(tenantId) ?? []
  existing.push(installation)
  INSTALLATIONS.set(tenantId, existing)

  // Increment downloadCount on catalog item
  const catalogItem = CATALOG.get(itemId)
  if (catalogItem) catalogItem.downloadCount++

  logger.info(`Item installed: ${itemId} for tenant ${tenantId}`, "installation-registry", {
    metadata: { installationId: installation.installationId, installedVersion },
  })
  return installation
}

function findInstallation(installationId: string): Installation | undefined {
  for (const installs of Array.from(INSTALLATIONS.values())) {
    const found = installs.find((i) => i.installationId === installationId)
    if (found) return found
  }
  return undefined
}

export function uninstallItem(installationId: string): void {
  const inst = findInstallation(installationId)
  if (!inst) throw new Error(`Installation not found: ${installationId}`)
  inst.status = "uninstalled"
}

export function recordUsage(installationId: string): void {
  const inst = findInstallation(installationId)
  if (!inst) throw new Error(`Installation not found: ${installationId}`)
  inst.usageCount++
  inst.lastUsedAt = new Date().toISOString()
}

export function getInstallationsForTenant(tenantId: string): Installation[] {
  return INSTALLATIONS.get(tenantId) ?? []
}

export function getInstallationsForItem(itemId: string): Installation[] {
  const results: Installation[] = []
  for (const installs of Array.from(INSTALLATIONS.values())) {
    for (const i of installs) {
      if (i.itemId === itemId) results.push(i)
    }
  }
  return results
}

export function getInstallationStats(): {
  totalInstallations: number
  activeInstallations: number
  totalUsageEvents: number
  topItems: string[]
} {
  const all: Installation[] = []
  for (const installs of Array.from(INSTALLATIONS.values())) {
    for (const i of installs) all.push(i)
  }

  const totalInstallations = all.length
  const activeInstallations = all.filter((i) => i.status === "active").length
  const totalUsageEvents = all.reduce((sum, i) => sum + i.usageCount, 0)

  const usageByItem: Record<string, number> = {}
  for (const i of all) {
    usageByItem[i.itemId] = (usageByItem[i.itemId] ?? 0) + i.usageCount
  }
  const topItems = Object.entries(usageByItem)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([itemId]) => itemId)

  return { totalInstallations, activeInstallations, totalUsageEvents, topItems }
}
