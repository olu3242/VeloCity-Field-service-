import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface NeuralRuntimeBinding {
  bindingId: string
  subsystemId: string
  neuralNodeId: string
  bindingType: "monitoring" | "advisory" | "directive"
  active: boolean
  signalsReceived: number
  advisoriesIssued: number
  directivesApplied: number
  boundAt: string
  lastInteractionAt?: string
}

const BINDINGS: Map<string, NeuralRuntimeBinding> = new Map()
const MAX_BINDINGS = 500

function cap(): void {
  if (BINDINGS.size > MAX_BINDINGS) {
    const firstKey = Array.from(BINDINGS.keys())[0]
    if (firstKey !== undefined) BINDINGS.delete(firstKey)
  }
}

export function bindSubsystem(
  subsystemId: string,
  neuralNodeId: string,
  bindingType: NeuralRuntimeBinding["bindingType"],
): NeuralRuntimeBinding {
  if (isRuntimePaused()) {
    logger.warn("bindSubsystem blocked: runtime paused", "operational-neural-runtime")
  }
  const binding: NeuralRuntimeBinding = {
    bindingId: crypto.randomUUID(),
    subsystemId,
    neuralNodeId,
    bindingType,
    active: true,
    signalsReceived: 0,
    advisoriesIssued: 0,
    directivesApplied: 0,
    boundAt: new Date().toISOString(),
  }
  BINDINGS.set(subsystemId, binding)
  cap()
  logger.info(
    `Subsystem bound: ${subsystemId} → node ${neuralNodeId}`,
    "operational-neural-runtime",
    { metadata: { bindingId: binding.bindingId, bindingType } },
  )
  return binding
}

export function unbindSubsystem(subsystemId: string): void {
  const b = BINDINGS.get(subsystemId)
  if (!b) return
  b.active = false
}

function touch(subsystemId: string): NeuralRuntimeBinding | undefined {
  const b = BINDINGS.get(subsystemId)
  if (!b) return undefined
  b.lastInteractionAt = new Date().toISOString()
  return b
}

export function recordSignal(subsystemId: string): void {
  const b = touch(subsystemId)
  if (!b) return
  b.signalsReceived++
}

export function recordAdvisory(subsystemId: string): void {
  const b = touch(subsystemId)
  if (!b) return
  b.advisoriesIssued++
}

export function recordDirective(subsystemId: string): void {
  const b = touch(subsystemId)
  if (!b) return
  b.directivesApplied++
}

export function getActiveBindings(): NeuralRuntimeBinding[] {
  return Array.from(BINDINGS.values()).filter((b) => b.active)
}

export function getBindingReport(): {
  total: number
  active: number
  byType: Record<string, number>
  totalInteractions: number
} {
  const all = Array.from(BINDINGS.values())
  const active = all.filter((b) => b.active).length
  const byType: Record<string, number> = {}
  let totalInteractions = 0
  for (const b of all) {
    byType[b.bindingType] = (byType[b.bindingType] ?? 0) + 1
    totalInteractions +=
      b.signalsReceived + b.advisoriesIssued + b.directivesApplied
  }
  return { total: BINDINGS.size, active, byType, totalInteractions }
}
