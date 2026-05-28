import { logger } from "@/runtime-core/observability"

export interface WorkflowPackage {
  packageId: string
  itemId: string
  workflowType: string
  version: string
  authorId: string
  nodeCount: number
  estimatedDurationMs: number
  requiredCapabilities: string[]
  signatureHash: string
  packagedAt: string
  schema: Record<string, unknown>
}

const PACKAGES: Map<string, WorkflowPackage> = new Map()
const PACKAGES_CAP = 1000

function extractNodeCount(schema: Record<string, unknown>): number {
  const nodes = schema["nodes"]
  if (Array.isArray(nodes)) return nodes.length
  return 0
}

export function packageWorkflow(
  itemId: string,
  workflowType: string,
  version: string,
  schema: Record<string, unknown>,
  requiredCapabilities: string[],
  authorId: string
): WorkflowPackage {
  if (PACKAGES.size >= PACKAGES_CAP) {
    const firstKey = Array.from(PACKAGES.keys())[0]
    if (firstKey) PACKAGES.delete(firstKey)
  }

  const nodeCount = extractNodeCount(schema)
  const signatureHash = `${itemId}-${version}-${Date.now()}`
  const estimatedDurationMs = nodeCount * 500

  const pkg: WorkflowPackage = {
    packageId: crypto.randomUUID(),
    itemId,
    workflowType,
    version,
    authorId,
    nodeCount,
    estimatedDurationMs,
    requiredCapabilities,
    signatureHash,
    packagedAt: new Date().toISOString(),
    schema,
  }

  PACKAGES.set(itemId, pkg)
  logger.info(`Workflow packaged: ${workflowType} v${version}`, "workflow-packager", {
    metadata: { itemId, nodeCount, estimatedDurationMs },
  })
  return pkg
}

export function getPackage(itemId: string): WorkflowPackage | undefined {
  return PACKAGES.get(itemId)
}

export function validatePackage(packageId: string): { valid: boolean; issues: string[] } {
  const pkg = Array.from(PACKAGES.values()).find((p) => p.packageId === packageId)
  if (!pkg) return { valid: false, issues: ["Package not found"] }

  const issues: string[] = []
  if (pkg.nodeCount <= 0) issues.push("nodeCount must be greater than 0")
  if (pkg.requiredCapabilities.length === 0) issues.push("requiredCapabilities must not be empty")
  if (!pkg.signatureHash) issues.push("signatureHash is missing")

  return { valid: issues.length === 0, issues }
}

export function getPackageSummary(): {
  total: number
  avgNodeCount: number
  byWorkflowType: Record<string, number>
} {
  const all = Array.from(PACKAGES.values())
  const total = all.length
  const avgNodeCount = total > 0 ? Math.round(all.reduce((sum, p) => sum + p.nodeCount, 0) / total) : 0
  const byWorkflowType: Record<string, number> = {}
  for (const p of all) {
    byWorkflowType[p.workflowType] = (byWorkflowType[p.workflowType] ?? 0) + 1
  }
  return { total, avgNodeCount, byWorkflowType }
}
