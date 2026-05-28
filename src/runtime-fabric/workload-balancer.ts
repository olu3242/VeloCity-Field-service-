import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { getAvailablePartitions } from "./partition-manager"

export interface BalancingAction {
  actionId: string
  actionType: "rebalance" | "drain" | "scale_up_signal" | "scale_down_signal"
  fromPartitionId?: string
  toPartitionId?: string
  reason: string
  triggeredAt: string
  executedBy: "automatic" | "operator"
}

const ACTIONS: BalancingAction[] = []
const ACTIONS_CAP = 500

function appendAction(action: BalancingAction): void {
  if (ACTIONS.length >= ACTIONS_CAP) ACTIONS.shift()
  ACTIONS.push(action)
}

export function checkBalance(): BalancingAction[] {
  const partitions = getAvailablePartitions()
  const taken: BalancingAction[] = []
  if (partitions.length === 0) return taken

  // Check for overloaded partitions
  for (const p of partitions) {
    const ratio = p.capacity > 0 ? p.used / p.capacity : 0
    if (ratio > 0.85) {
      const action: BalancingAction = {
        actionId: crypto.randomUUID(),
        actionType: "scale_up_signal",
        fromPartitionId: p.partitionId,
        reason: `Partition load at ${Math.round(ratio * 100)}% exceeds 85% threshold`,
        triggeredAt: new Date().toISOString(),
        executedBy: "automatic",
      }
      appendAction(action)
      taken.push(action)
      logger.warn("Scale-up signal emitted", "workload-balancer", {
        metadata: { partitionId: p.partitionId, ratio },
      })
    }
  }

  // Check for underutilised fleet
  const totalCap = partitions.reduce((s, p) => s + p.capacity, 0)
  const totalUsed = partitions.reduce((s, p) => s + p.used, 0)
  const avgLoad = totalCap > 0 ? totalUsed / totalCap : 0
  if (avgLoad < 0.2 && partitions.length > 1) {
    const lowest = partitions.reduce((min, p) => {
      const minR = min.capacity > 0 ? min.used / min.capacity : 0
      const pR = p.capacity > 0 ? p.used / p.capacity : 0
      return pR < minR ? p : min
    })
    const action: BalancingAction = {
      actionId: crypto.randomUUID(),
      actionType: "scale_down_signal",
      fromPartitionId: lowest.partitionId,
      reason: `Average fleet load ${Math.round(avgLoad * 100)}% below 20% — candidate for scale-down`,
      triggeredAt: new Date().toISOString(),
      executedBy: "automatic",
    }
    appendAction(action)
    taken.push(action)
    logger.info("Scale-down signal emitted", "workload-balancer", {
      metadata: { partitionId: lowest.partitionId, avgLoad },
    })
  }

  return taken
}

export function triggerRebalance(
  fromPartitionId: string,
  toPartitionId: string,
  reason: string,
): BalancingAction {
  if (isRuntimePaused()) {
    logger.warn("triggerRebalance blocked: runtime is paused", "workload-balancer")
    throw new Error("Runtime is paused — rebalance blocked")
  }
  const action: BalancingAction = {
    actionId: crypto.randomUUID(),
    actionType: "rebalance",
    fromPartitionId,
    toPartitionId,
    reason,
    triggeredAt: new Date().toISOString(),
    executedBy: "operator",
  }
  appendAction(action)
  logger.info("Rebalance triggered", "workload-balancer", { metadata: { fromPartitionId, toPartitionId } })
  return action
}

export function getBalancingHistory(): BalancingAction[] {
  return [...ACTIONS]
}

export function getBalancingSummary(): {
  total: number
  byType: Record<string, number>
  lastActionAt?: string
} {
  const byType: Record<string, number> = {}
  for (const a of ACTIONS) byType[a.actionType] = (byType[a.actionType] ?? 0) + 1
  const last = ACTIONS.at(-1)
  return { total: ACTIONS.length, byType, lastActionAt: last?.triggeredAt }
}
