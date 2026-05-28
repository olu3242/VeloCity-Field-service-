import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordDecision } from "./runtime-brain"

export type EscalationLevel = "info" | "warning" | "alert" | "critical" | "emergency"
export type EscalationChannel =
  | "operator_dashboard"
  | "pagerduty"
  | "slack"
  | "email"
  | "sms"
  | "auto_remediate"

export interface EscalationDecision {
  decisionId: string
  triggerId: string
  tenantId?: string
  level: EscalationLevel
  channels: EscalationChannel[]
  summary: string
  confidence: number
  autoRemediationRecommended: boolean
  decidedAt: string
  acknowledged: boolean
  acknowledgedAt?: string
}

const DECISIONS: EscalationDecision[] = []
const CAP = 500
const ALL_CHANNELS: EscalationChannel[] = ["operator_dashboard", "pagerduty", "slack", "email", "sms", "auto_remediate"]

function deriveLevel(signals: string[]): EscalationLevel {
  const joined = signals.join(" ")
  if (joined.includes("data_loss") || joined.includes("cascade")) return "emergency"
  if (joined.includes("circuit") && joined.includes("payment")) return "critical"
  if (joined.includes("timeout")) return "alert"
  if (joined.includes("retry")) return "warning"
  return "info"
}

function channelsForLevel(level: EscalationLevel): EscalationChannel[] {
  switch (level) {
    case "emergency": return [...ALL_CHANNELS]
    case "critical": return ["pagerduty", "slack", "auto_remediate"]
    case "alert": return ["operator_dashboard", "slack"]
    default: return ["operator_dashboard"]
  }
}

export function evaluateEscalation(
  triggerId: string,
  signals: string[],
  tenantId?: string,
): EscalationDecision {
  if (isRuntimePaused()) {
    logger.warn("evaluateEscalation blocked: runtime paused", "escalation-intelligence")
  }
  const level = deriveLevel(signals)
  const channels = channelsForLevel(level)
  const confidence = level === "emergency" ? 0.95 : level === "critical" ? 0.88 : 0.80
  const decision: EscalationDecision = {
    decisionId: crypto.randomUUID(),
    triggerId,
    tenantId,
    level,
    channels,
    summary: `Escalation '${level}' triggered by [${signals.slice(0, 3).join(", ")}]`,
    confidence,
    autoRemediationRecommended: channels.includes("auto_remediate"),
    decidedAt: new Date().toISOString(),
    acknowledged: false,
  }
  if (DECISIONS.length >= CAP) DECISIONS.shift()
  DECISIONS.push(decision)
  recordDecision("escalation", confidence)
  logger.info(`Escalation evaluated: ${level}`, "escalation-intelligence", { tenantId })
  return decision
}

export function acknowledgeEscalation(decisionId: string): void {
  const decision = DECISIONS.find((d) => d.decisionId === decisionId)
  if (decision) {
    decision.acknowledged = true
    decision.acknowledgedAt = new Date().toISOString()
  }
}

export function getOpenEscalations(tenantId?: string): EscalationDecision[] {
  return DECISIONS.filter(
    (d) => !d.acknowledged && (tenantId === undefined || d.tenantId === tenantId),
  )
}

export function getEscalationStats(): {
  total: number; byLevel: Record<string, number>; unacknowledgedCount: number
} {
  const byLevel: Record<string, number> = {}
  let unacknowledgedCount = 0
  for (const d of DECISIONS) {
    byLevel[d.level] = (byLevel[d.level] ?? 0) + 1
    if (!d.acknowledged) unacknowledgedCount++
  }
  return { total: DECISIONS.length, byLevel, unacknowledgedCount }
}
