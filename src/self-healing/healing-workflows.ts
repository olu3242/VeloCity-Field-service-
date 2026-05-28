import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type HealingPattern =
  | "restart"
  | "reroute"
  | "degrade_gracefully"
  | "isolate_and_heal"
  | "progressive_restore"

export interface HealingWorkflow {
  workflowId: string
  name: string
  pattern: HealingPattern
  tenantId?: string
  triggerConditions: string[]
  healingSteps: string[]
  estimatedDurationMs: number
  priority: number
  lastTriggeredAt?: string
  triggerCount: number
  successCount: number
  registeredAt: string
}

const WORKFLOWS = new Map<string, HealingWorkflow>()
const WORKFLOWS_CAP = 200

export function registerHealingWorkflow(
  name: string,
  pattern: HealingPattern,
  triggerConditions: string[],
  healingSteps: string[],
  estimatedDurationMs: number,
  priority: number,
  tenantId?: string
): HealingWorkflow {
  if (isRuntimePaused()) {
    logger.warn("registerHealingWorkflow blocked: runtime paused")
    throw new Error("Runtime is paused")
  }
  if (WORKFLOWS.size >= WORKFLOWS_CAP) {
    const firstKey = Array.from(WORKFLOWS.keys())[0]
    if (firstKey !== undefined) WORKFLOWS.delete(firstKey)
  }
  const workflow: HealingWorkflow = {
    workflowId: crypto.randomUUID(),
    name,
    pattern,
    tenantId,
    triggerConditions,
    healingSteps,
    estimatedDurationMs,
    priority,
    triggerCount: 0,
    successCount: 0,
    registeredAt: new Date().toISOString(),
  }
  WORKFLOWS.set(workflow.workflowId, workflow)
  return workflow
}

export function findMatchingWorkflow(triggerCondition: string): HealingWorkflow | undefined {
  const matches = Array.from(WORKFLOWS.values()).filter((w) =>
    w.triggerConditions.includes(triggerCondition)
  )
  matches.sort((a, b) => b.priority - a.priority)
  return matches[0]
}

export function triggerWorkflow(workflowId: string, success: boolean): void {
  const workflow = WORKFLOWS.get(workflowId)
  if (!workflow) return
  workflow.lastTriggeredAt = new Date().toISOString()
  workflow.triggerCount++
  if (success) workflow.successCount++
}

export function getWorkflowsByPattern(pattern: HealingPattern): HealingWorkflow[] {
  return Array.from(WORKFLOWS.values()).filter((w) => w.pattern === pattern)
}

export function getHealingWorkflowSummary(): {
  total: number
  byPattern: Record<string, number>
  avgSuccessRate: number
} {
  const all = Array.from(WORKFLOWS.values())
  const total = all.length
  const byPattern: Record<string, number> = {}
  for (const w of all) {
    byPattern[w.pattern] = (byPattern[w.pattern] ?? 0) + 1
  }
  const avgSuccessRate =
    total > 0
      ? all.reduce((s, w) => s + (w.triggerCount > 0 ? w.successCount / w.triggerCount : 0), 0) /
        total
      : 0
  return { total, byPattern, avgSuccessRate }
}
