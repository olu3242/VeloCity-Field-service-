import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordDownload } from "./exchange-registry"

export interface PackageInstallation {
  installationId: string
  assetId: string
  tenantId: string
  installedVersion: string
  installedBy: string
  installedAt: string
  status: "active" | "disabled" | "uninstalled" | "update_available"
  configuration: Record<string, unknown>
  usageCount: number
  lastUsedAt?: string
}

const INSTALLATIONS: Map<string, PackageInstallation[]> = new Map()
const INSTALL_CAP = 5000

function totalInstallCount(): number {
  let count = 0
  for (const arr of Array.from(INSTALLATIONS.values())) count += arr.length
  return count
}

function findInstallation(installationId: string): PackageInstallation | undefined {
  for (const arr of Array.from(INSTALLATIONS.values())) {
    const found = arr.find((i) => i.installationId === installationId)
    if (found) return found
  }
  return undefined
}

export function installPackage(
  assetId: string,
  tenantId: string,
  installedBy: string,
  config?: Record<string, unknown>
): PackageInstallation {
  if (isRuntimePaused()) {
    logger.warn("installPackage blocked: runtime paused", "package-manager")
    throw new Error("Runtime is paused")
  }
  if (totalInstallCount() >= INSTALL_CAP) {
    const firstKey = Array.from(INSTALLATIONS.keys())[0]
    if (firstKey !== undefined) {
      const arr = INSTALLATIONS.get(firstKey) ?? []
      arr.shift()
      if (arr.length === 0) INSTALLATIONS.delete(firstKey)
    }
  }
  recordDownload(assetId)
  const installation: PackageInstallation = {
    installationId: crypto.randomUUID(),
    assetId,
    tenantId,
    installedVersion: "1.0.0",
    installedBy,
    installedAt: new Date().toISOString(),
    status: "active",
    configuration: config ?? {},
    usageCount: 0,
  }
  const existing = INSTALLATIONS.get(tenantId) ?? []
  existing.push(installation)
  INSTALLATIONS.set(tenantId, existing)
  logger.info(`Package installed: ${assetId}`, "package-manager", { metadata: { tenantId, installationId: installation.installationId } })
  return installation
}

export function disableInstallation(installationId: string): void {
  const inst = findInstallation(installationId)
  if (!inst) return
  inst.status = "disabled"
}

export function uninstallPackage(installationId: string): void {
  const inst = findInstallation(installationId)
  if (!inst) return
  inst.status = "uninstalled"
}

export function recordUsage(installationId: string): void {
  const inst = findInstallation(installationId)
  if (!inst) return
  inst.usageCount++
  inst.lastUsedAt = new Date().toISOString()
}

export function getInstalledPackages(tenantId: string): PackageInstallation[] {
  return INSTALLATIONS.get(tenantId) ?? []
}

export function getInstallationStats(): {
  total: number
  active: number
  disabled: number
  uninstalled: number
  totalUsage: number
} {
  let active = 0, disabled = 0, uninstalled = 0, totalUsage = 0, total = 0
  for (const arr of Array.from(INSTALLATIONS.values())) {
    for (const i of arr) {
      total++
      if (i.status === "active") active++
      else if (i.status === "disabled") disabled++
      else if (i.status === "uninstalled") uninstalled++
      totalUsage += i.usageCount
    }
  }
  return { total, active, disabled, uninstalled, totalUsage }
}
