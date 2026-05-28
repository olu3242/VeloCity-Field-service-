import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederatedCognition {
  federationId: string
  sourceNodeId: string
  targetNodeId?: string
  cognitionType: string
  payload: Record<string, unknown>
  trustLevel: "low" | "medium" | "high"
  anonymous: boolean
  tenantId?: string
  sharedAt: string
  receivedAt?: string
  status: "pending" | "received" | "applied" | "rejected"
}

const FEDERATED: FederatedCognition[] = []
const MAX_FEDERATED = 2000

export function shareCognition(
  sourceNodeId: string,
  cognitionType: string,
  payload: Record<string, unknown>,
  trustLevel: "low" | "medium" | "high",
  anonymous = true,
  targetNodeId?: string,
  tenantId?: string,
): FederatedCognition {
  if (isRuntimePaused()) {
    logger.warn("shareCognition blocked: runtime paused", "cognition-federation")
    throw new Error("Runtime is paused")
  }

  const cognition: FederatedCognition = {
    federationId: crypto.randomUUID(),
    sourceNodeId,
    targetNodeId,
    cognitionType,
    payload,
    trustLevel,
    anonymous,
    tenantId: anonymous ? undefined : tenantId,
    sharedAt: new Date().toISOString(),
    status: "pending",
  }

  if (FEDERATED.length >= MAX_FEDERATED) FEDERATED.shift()
  FEDERATED.push(cognition)
  logger.info(`Cognition shared: ${cognitionType}`, "cognition-federation", {
    metadata: { federationId: cognition.federationId, trustLevel },
  })
  return cognition
}

function findById(federationId: string): FederatedCognition | undefined {
  return FEDERATED.find((f) => f.federationId === federationId)
}

export function markReceived(federationId: string): void {
  const c = findById(federationId)
  if (c) { c.status = "received"; c.receivedAt = new Date().toISOString() }
}

export function markApplied(federationId: string): void {
  const c = findById(federationId)
  if (c) c.status = "applied"
}

export function rejectCognition(federationId: string): void {
  const c = findById(federationId)
  if (c) c.status = "rejected"
}

export function getPendingCognitions(targetNodeId?: string): FederatedCognition[] {
  return FEDERATED.filter(
    (f) => f.status === "pending" && (targetNodeId === undefined || f.targetNodeId === targetNodeId || f.targetNodeId === undefined),
  )
}

export function getFederationStats(): {
  total: number
  pending: number
  received: number
  applied: number
  rejected: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  let pending = 0, received = 0, applied = 0, rejected = 0
  for (const f of FEDERATED) {
    byType[f.cognitionType] = (byType[f.cognitionType] ?? 0) + 1
    if (f.status === "pending") pending++
    else if (f.status === "received") received++
    else if (f.status === "applied") applied++
    else rejected++
  }
  return { total: FEDERATED.length, pending, received, applied, rejected, byType }
}
