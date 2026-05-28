import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface RegulationRule {
  ruleId: string
  parameter: string
  condition: string
  targetValue: number
  currentValue?: number
  priority: number
  active: boolean
  lastTriggeredAt?: string
  triggerCount: number
  createdAt: string
}

export interface RegulationEvent {
  eventId: string
  ruleId: string
  tenantId?: string
  previousValue: number
  appliedValue: number
  reason: string
  status: "applied" | "rejected" | "reverted"
  occurredAt: string
}

const RULES: Map<string, RegulationRule> = new Map()
const EVENTS: RegulationEvent[] = []
const MAX_RULES = 200
const MAX_EVENTS = 500

function capRules(): void {
  if (RULES.size > MAX_RULES) {
    const firstKey = Array.from(RULES.keys())[0]
    if (firstKey !== undefined) RULES.delete(firstKey)
  }
}

function capEvents(): void {
  while (EVENTS.length > MAX_EVENTS) EVENTS.shift()
}

export function createRule(
  parameter: string,
  condition: string,
  targetValue: number,
  priority: number,
): RegulationRule {
  if (isRuntimePaused()) {
    logger.warn("createRule blocked: runtime paused", "self-regulation")
  }
  const rule: RegulationRule = {
    ruleId: crypto.randomUUID(),
    parameter,
    condition,
    targetValue,
    priority,
    active: true,
    triggerCount: 0,
    createdAt: new Date().toISOString(),
  }
  RULES.set(rule.ruleId, rule)
  capRules()
  logger.info(`Regulation rule created: ${parameter}`, "self-regulation", {
    metadata: { ruleId: rule.ruleId, priority },
  })
  return rule
}

export function deactivateRule(ruleId: string): void {
  const rule = RULES.get(ruleId)
  if (!rule) return
  rule.active = false
}

export function applyRegulation(
  ruleId: string,
  previous: number,
  applied: number,
  tenantId?: string,
  reason?: string,
): RegulationEvent {
  const rule = RULES.get(ruleId)
  if (rule) {
    rule.currentValue = applied
    rule.lastTriggeredAt = new Date().toISOString()
    rule.triggerCount++
  }
  const event: RegulationEvent = {
    eventId: crypto.randomUUID(),
    ruleId,
    tenantId,
    previousValue: previous,
    appliedValue: applied,
    reason: reason ?? "regulation applied",
    status: "applied",
    occurredAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  capEvents()
  return event
}

export function revertRegulation(eventId: string): void {
  const event = EVENTS.find((e) => e.eventId === eventId)
  if (!event) return
  event.status = "reverted"
}

export function getActiveRules(priority?: number): RegulationRule[] {
  return Array.from(RULES.values()).filter(
    (r) => r.active && (priority === undefined || r.priority === priority),
  )
}

export function getRegulationSummary(): {
  totalRules: number
  activeRules: number
  totalEvents: number
  revertRate: number
} {
  const activeRules = Array.from(RULES.values()).filter((r) => r.active).length
  const reverted = EVENTS.filter((e) => e.status === "reverted").length
  const revertRate = EVENTS.length > 0 ? reverted / EVENTS.length : 0
  return {
    totalRules: RULES.size,
    activeRules,
    totalEvents: EVENTS.length,
    revertRate,
  }
}
