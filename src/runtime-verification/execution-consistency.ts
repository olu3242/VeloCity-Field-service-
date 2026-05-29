import { clampScore } from "@/runtime-core/scoring"

export interface ConsistencyCheck {
  checkId: string
  executionId: string
  tenantId?: string
  nodeCount: number
  nodesChecked: number
  stateConsistent: boolean
  orderingConsistent: boolean
  replicationConsistent: boolean
  conflictsDetected: number
  consistencyScore: number
  checkedAt: string
}

const CHECKS: ConsistencyCheck[] = []
const CHECKS_CAP = 500

export function checkConsistency(
  executionId: string,
  nodeCount: number,
  nodesChecked: number,
  tenantId?: string
): ConsistencyCheck {
  if (CHECKS.length >= CHECKS_CAP) CHECKS.shift()

  const stateConsistent = nodeCount === 0 ? true : nodesChecked / nodeCount >= 0.8
  const orderingConsistent = true
  const replicationConsistent = nodesChecked >= Math.ceil(nodeCount / 2)
  const conflictsDetected = 0
  const consistencyScore = clampScore((nodesChecked / Math.max(1, nodeCount)) * 100)

  const check: ConsistencyCheck = {
    checkId: crypto.randomUUID(),
    executionId,
    tenantId,
    nodeCount,
    nodesChecked,
    stateConsistent,
    orderingConsistent,
    replicationConsistent,
    conflictsDetected,
    consistencyScore,
    checkedAt: new Date().toISOString(),
  }

  CHECKS.push(check)
  return check
}

export function getInconsistentExecutions(): ConsistencyCheck[] {
  return CHECKS.filter((c) => !c.stateConsistent)
}

export function getConsistencySummary(): {
  total: number
  consistent: number
  inconsistent: number
  avgScore: number
} {
  const consistent = CHECKS.filter((c) => c.stateConsistent).length
  const avgScore =
    CHECKS.length === 0
      ? 0
      : CHECKS.reduce((sum, c) => sum + c.consistencyScore, 0) / CHECKS.length
  return {
    total: CHECKS.length,
    consistent,
    inconsistent: CHECKS.length - consistent,
    avgScore,
  }
}
