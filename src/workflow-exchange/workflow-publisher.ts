import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { registerAsset, publishAsset } from "./exchange-registry"

export interface PublishedWorkflow {
  publicationId: string
  workflowType: string
  name: string
  description: string
  publisherId: string
  tenantId?: string
  schema: Record<string, unknown>
  nodeCount: number
  version: string
  signatureHash: string
  changeLog: string
  publishedAt: string
  assetId?: string
}

const PUBLICATIONS: Map<string, PublishedWorkflow> = new Map()
const PUBLICATIONS_CAP = 1000

export function publishWorkflow(
  workflowType: string,
  name: string,
  schema: Record<string, unknown>,
  publisherId: string,
  options?: Partial<Pick<PublishedWorkflow, "description" | "tenantId" | "version" | "changeLog" | "nodeCount">>
): PublishedWorkflow {
  if (isRuntimePaused()) {
    logger.warn("publishWorkflow blocked: runtime paused", "workflow-publisher")
    throw new Error("Runtime is paused")
  }
  if (PUBLICATIONS.size >= PUBLICATIONS_CAP) {
    const firstKey = Array.from(PUBLICATIONS.keys())[0]
    if (firstKey !== undefined) PUBLICATIONS.delete(firstKey)
  }
  const version = options?.version ?? "1.0.0"
  const publication: PublishedWorkflow = {
    publicationId: crypto.randomUUID(),
    workflowType,
    name,
    description: options?.description ?? "",
    publisherId,
    tenantId: options?.tenantId,
    schema,
    nodeCount: options?.nodeCount ?? Object.keys(schema).length,
    version,
    signatureHash: `${workflowType}-${version}-${publisherId}`,
    changeLog: options?.changeLog ?? "Initial release",
    publishedAt: new Date().toISOString(),
  }
  const asset = registerAsset(name, "workflow_template", publisherId, {
    version,
    tenantId: options?.tenantId,
  })
  publishAsset(asset.assetId)
  publication.assetId = asset.assetId
  PUBLICATIONS.set(publication.publicationId, publication)
  logger.info(`Workflow published: ${name}`, "workflow-publisher", {
    metadata: { publicationId: publication.publicationId, assetId: asset.assetId },
  })
  return publication
}

export function getPublication(publicationId: string): PublishedWorkflow | undefined {
  return PUBLICATIONS.get(publicationId)
}

export function getPublicationsByPublisher(publisherId: string): PublishedWorkflow[] {
  return Array.from(PUBLICATIONS.values()).filter((p) => p.publisherId === publisherId)
}

export function getPublicationStats(): {
  total: number
  byWorkflowType: Record<string, number>
  byPublisher: Record<string, number>
} {
  const byWorkflowType: Record<string, number> = {}
  const byPublisher: Record<string, number> = {}
  for (const p of Array.from(PUBLICATIONS.values())) {
    byWorkflowType[p.workflowType] = (byWorkflowType[p.workflowType] ?? 0) + 1
    byPublisher[p.publisherId] = (byPublisher[p.publisherId] ?? 0) + 1
  }
  return { total: PUBLICATIONS.size, byWorkflowType, byPublisher }
}
