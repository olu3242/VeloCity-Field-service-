import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface RuntimePackage {
  packageId: string
  name: string
  packageType: "plugin" | "extension" | "adapter" | "operator" | "capability_pack"
  version: string
  authorId: string
  tenantId?: string
  requiredRuntimeVersion: string
  capabilities: string[]
  dependencies: string[]
  signatureHash: string
  installScript?: string
  packagedAt: string
  published: boolean
}

const PACKAGES: Map<string, RuntimePackage> = new Map()
const PACKAGES_CAP = 1000

export function createPackage(
  name: string,
  type: RuntimePackage["packageType"],
  version: string,
  authorId: string,
  capabilities: string[],
  options?: Partial<Pick<RuntimePackage, "tenantId" | "requiredRuntimeVersion" | "dependencies" | "installScript">>
): RuntimePackage {
  if (PACKAGES.size >= PACKAGES_CAP) {
    const firstKey = Array.from(PACKAGES.keys())[0]
    if (firstKey !== undefined) PACKAGES.delete(firstKey)
  }
  const pkg: RuntimePackage = {
    packageId: crypto.randomUUID(),
    name,
    packageType: type,
    version,
    authorId,
    tenantId: options?.tenantId,
    requiredRuntimeVersion: options?.requiredRuntimeVersion ?? "1.0.0",
    capabilities,
    dependencies: options?.dependencies ?? [],
    signatureHash: crypto.randomUUID(),
    installScript: options?.installScript,
    packagedAt: new Date().toISOString(),
    published: false,
  }
  PACKAGES.set(pkg.packageId, pkg)
  logger.info(`Package created: ${name}`, "runtime-packager", { metadata: { packageId: pkg.packageId } })
  return pkg
}

export function publishPackage(packageId: string): void {
  if (isRuntimePaused()) {
    logger.warn("publishPackage blocked: runtime paused", "runtime-packager")
    return
  }
  const pkg = PACKAGES.get(packageId)
  if (!pkg) return
  pkg.published = true
  logger.info(`Package published: ${packageId}`, "runtime-packager")
}

export function validatePackage(packageId: string): { valid: boolean; issues: string[] } {
  const pkg = PACKAGES.get(packageId)
  if (!pkg) return { valid: false, issues: ["Package not found"] }
  const issues: string[] = []
  if (pkg.capabilities.length === 0) issues.push("capabilities must not be empty")
  if (!pkg.signatureHash) issues.push("signatureHash must be present")
  if (!pkg.requiredRuntimeVersion) issues.push("requiredRuntimeVersion must not be empty")
  return { valid: issues.length === 0, issues }
}

export function getPublishedPackages(packageType?: RuntimePackage["packageType"]): RuntimePackage[] {
  return Array.from(PACKAGES.values()).filter(
    (p) => p.published && (packageType === undefined || p.packageType === packageType)
  )
}

export function getPackageStats(): {
  total: number
  published: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  let published = 0
  for (const p of Array.from(PACKAGES.values())) {
    byType[p.packageType] = (byType[p.packageType] ?? 0) + 1
    if (p.published) published++
  }
  return { total: PACKAGES.size, published, byType }
}
