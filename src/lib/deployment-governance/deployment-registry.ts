/**
 * Deployment Registry — tracks deployments across environments.
 * In-memory singleton with rolling cap of 200 entries.
 */

import { isRuntimePaused } from "@/lib/governance/operator"

const DEPLOY_CAP = 200

export interface Deployment {
  id: string
  name: string
  version: string
  environment: "development" | "staging" | "production"
  status: "pending" | "canary" | "rolling" | "complete" | "rolled_back" | "failed"
  tenantId?: string
  startedAt: string
  completedAt?: string
  rollbackAvailable: boolean
  healthScore: number
  metadata: Record<string, unknown>
}

const DEPLOYMENTS: Map<string, Deployment> = new Map()

function enforceCap(): void {
  if (DEPLOYMENTS.size >= DEPLOY_CAP) {
    const firstKey = Array.from(DEPLOYMENTS.keys())[0]
    if (firstKey !== undefined) DEPLOYMENTS.delete(firstKey)
  }
}

export function registerDeployment(
  name: string,
  version: string,
  environment: Deployment["environment"],
  metadata?: Record<string, unknown>
): Deployment {
  enforceCap()
  const deployment: Deployment = {
    id: crypto.randomUUID(),
    name,
    version,
    environment,
    status: "pending",
    startedAt: new Date().toISOString(),
    rollbackAvailable: false,
    healthScore: 100,
    metadata: metadata ?? {},
  }
  DEPLOYMENTS.set(deployment.id, deployment)
  return deployment
}

export function updateDeploymentStatus(
  id: string,
  status: Deployment["status"],
  healthScore?: number
): void {
  const dep = DEPLOYMENTS.get(id)
  if (!dep) return
  dep.status = status
  if (healthScore !== undefined) dep.healthScore = healthScore
  if (status === "complete" || status === "rolled_back" || status === "failed") {
    dep.completedAt = new Date().toISOString()
  }
  if (status === "complete") dep.rollbackAvailable = true
}

export function getActiveDeployments(): Deployment[] {
  return Array.from(DEPLOYMENTS.values()).filter(
    (d) => d.status === "pending" || d.status === "canary" || d.status === "rolling"
  )
}

export function getDeploymentsByEnv(env: Deployment["environment"]): Deployment[] {
  return Array.from(DEPLOYMENTS.values()).filter((d) => d.environment === env)
}

export function rollbackDeployment(id: string, reason: string): void {
  if (isRuntimePaused()) return
  const dep = DEPLOYMENTS.get(id)
  if (!dep || !dep.rollbackAvailable) return
  dep.status = "rolled_back"
  dep.completedAt = new Date().toISOString()
  dep.metadata = { ...dep.metadata, rollbackReason: reason }
}
