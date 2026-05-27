/**
 * Lineage Tracker — records deployment ancestry chains.
 * In-memory singleton with rolling cap of 300 entries.
 */

const LINEAGE_CAP = 300

export interface DeploymentLineage {
  deploymentId: string
  parentDeploymentId?: string
  changeType: "feature" | "hotfix" | "rollback" | "config" | "dependency"
  changedComponents: string[]
  triggeredBy: string
  lineageAt: string
}

const LINEAGE: DeploymentLineage[] = []

function enforceCap(): void {
  while (LINEAGE.length > LINEAGE_CAP) LINEAGE.shift()
}

export function recordLineage(
  deploymentId: string,
  changeType: DeploymentLineage["changeType"],
  changedComponents: string[],
  triggeredBy: string,
  parentDeploymentId?: string
): DeploymentLineage {
  const entry: DeploymentLineage = {
    deploymentId,
    parentDeploymentId,
    changeType,
    changedComponents,
    triggeredBy,
    lineageAt: new Date().toISOString(),
  }
  LINEAGE.push(entry)
  enforceCap()
  return entry
}

export function getLineage(deploymentId: string): DeploymentLineage[] {
  const chain: DeploymentLineage[] = []
  let currentId: string | undefined = deploymentId

  while (currentId !== undefined) {
    const entry = LINEAGE.find((l) => l.deploymentId === currentId)
    if (!entry) break
    chain.unshift(entry)
    currentId = entry.parentDeploymentId
  }
  return chain
}

export function getRootDeployment(deploymentId: string): DeploymentLineage | undefined {
  const chain = getLineage(deploymentId)
  return chain[0]
}
