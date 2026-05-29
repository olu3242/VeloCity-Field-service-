export interface DAGValidation {
  validationId: string
  workflowId: string
  tenantId?: string
  nodeCount: number
  edgeCount: number
  hasCycles: boolean
  hasUnreachableNodes: boolean
  hasOrphanedNodes: boolean
  executionOrderValid: boolean
  passed: boolean
  issues: string[]
  validatedAt: string
}

const VALIDATIONS: DAGValidation[] = []
const VALIDATIONS_CAP = 500

export function validateDAG(
  workflowId: string,
  nodeCount: number,
  edgeCount: number,
  hasCycles: boolean,
  tenantId?: string
): DAGValidation {
  if (VALIDATIONS.length >= VALIDATIONS_CAP) VALIDATIONS.shift()

  const hasUnreachableNodes = false
  const hasOrphanedNodes = false
  const executionOrderValid = !hasCycles
  const passed = !hasCycles && !hasUnreachableNodes && !hasOrphanedNodes
  const issues: string[] = []
  if (hasCycles) issues.push("cycle_detected")

  const validation: DAGValidation = {
    validationId: crypto.randomUUID(),
    workflowId,
    tenantId,
    nodeCount,
    edgeCount,
    hasCycles,
    hasUnreachableNodes,
    hasOrphanedNodes,
    executionOrderValid,
    passed,
    issues,
    validatedAt: new Date().toISOString(),
  }

  VALIDATIONS.push(validation)
  return validation
}

export function getValidation(workflowId: string): DAGValidation | undefined {
  return VALIDATIONS.find((v) => v.workflowId === workflowId)
}

export function getFailingDAGs(): DAGValidation[] {
  return VALIDATIONS.filter((v) => !v.passed)
}

export function getDAGSummary(): {
  total: number
  passed: number
  failed: number
  cycleCount: number
} {
  const passed = VALIDATIONS.filter((v) => v.passed).length
  const cycleCount = VALIDATIONS.filter((v) => v.hasCycles).length
  return { total: VALIDATIONS.length, passed, failed: VALIDATIONS.length - passed, cycleCount }
}
