import { logger } from "@/runtime-core/observability"

export interface FlowVariant {
  variantId: string
  workflowType: string
  variantName: string
  tenantId?: string
  triggerConditions: Record<string, unknown>
  adaptationReason: string
  performanceGain: number
  rolloutPct: number
  status: "candidate" | "testing" | "promoted" | "retired"
  createdAt: string
  promotedAt?: string
}

const VARIANTS: Map<string, FlowVariant[]> = new Map()
const MAX_PER_TYPE = 5

export function createVariant(
  workflowType: string,
  name: string,
  adaptationReason: string,
  performanceGain: number,
  triggers: Record<string, unknown>,
  tenantId?: string,
): FlowVariant {
  const existing = VARIANTS.get(workflowType) ?? []
  if (existing.length >= MAX_PER_TYPE) existing.shift()
  const variant: FlowVariant = {
    variantId: crypto.randomUUID(),
    workflowType,
    variantName: name,
    tenantId,
    triggerConditions: triggers,
    adaptationReason,
    performanceGain,
    rolloutPct: 0,
    status: "candidate",
    createdAt: new Date().toISOString(),
  }
  existing.push(variant)
  VARIANTS.set(workflowType, existing)
  logger.info(`Flow variant created: ${name} for ${workflowType}`, "adaptive-flows", {
    metadata: { variantId: variant.variantId, performanceGain },
  })
  return variant
}

export function promoteVariant(variantId: string): void {
  for (const variants of Array.from(VARIANTS.values())) {
    const v = variants.find(v => v.variantId === variantId)
    if (v) { v.rolloutPct = 100; v.status = "promoted"; v.promotedAt = new Date().toISOString(); return }
  }
}

export function retireVariant(variantId: string): void {
  for (const variants of Array.from(VARIANTS.values())) {
    const v = variants.find(v => v.variantId === variantId)
    if (v) { v.status = "retired"; return }
  }
}

export function getActiveVariants(workflowType: string): FlowVariant[] {
  return (VARIANTS.get(workflowType) ?? []).filter(v => v.status !== "retired")
}

export function getVariantSummary(): { total: number; promoted: number; testing: number; avgPerformanceGain: number } {
  const all = Array.from(VARIANTS.values()).flat()
  const promoted = all.filter(v => v.status === "promoted").length
  const testing = all.filter(v => v.status === "testing").length
  const avgPerformanceGain = all.length > 0 ? all.reduce((s, v) => s + v.performanceGain, 0) / all.length : 0
  return { total: all.length, promoted, testing, avgPerformanceGain }
}
