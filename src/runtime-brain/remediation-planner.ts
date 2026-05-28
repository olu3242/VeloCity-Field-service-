import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordDecision } from "./runtime-brain"

export interface RemediationPlan {
  planId: string
  failureSignal: string
  tenantId?: string
  correlationId: string
  severity: "low" | "medium" | "high" | "critical"
  recommendedActions: {
    action: string
    priority: number
    estimatedImpact: string
    automated: boolean
  }[]
  confidence: number
  reasoning: string
  createdAt: string
  resolvedAt?: string
}

const PLANS: RemediationPlan[] = []
const CAP = 500

function deriveSeverity(signal: string): RemediationPlan["severity"] {
  if (signal.includes("critical") || signal.includes("data_loss") || signal.includes("cascade")) return "critical"
  if (signal.includes("circuit")) return "high"
  if (signal.includes("timeout")) return "medium"
  return "low"
}

function confidenceForSeverity(severity: RemediationPlan["severity"]): number {
  switch (severity) {
    case "critical": return 0.65
    case "high": return 0.75
    case "medium": return 0.82
    default: return 0.88
  }
}

function buildActions(signal: string, severity: RemediationPlan["severity"]) {
  const actions: RemediationPlan["recommendedActions"] = [
    { action: "isolate_failing_component", priority: 1, estimatedImpact: "Prevents spread", automated: severity === "critical" || severity === "high" },
    { action: "notify_ops_team", priority: 2, estimatedImpact: "Human awareness", automated: false },
  ]
  if (signal.includes("circuit") || signal.includes("timeout")) {
    actions.push({ action: "reset_circuit_breaker", priority: 3, estimatedImpact: "Restores traffic flow", automated: true })
  } else {
    actions.push({ action: "collect_diagnostics", priority: 3, estimatedImpact: "Root cause analysis", automated: true })
  }
  return actions
}

export function planRemediation(
  failureSignal: string,
  correlationId: string,
  tenantId?: string,
): RemediationPlan {
  if (isRuntimePaused()) {
    logger.warn("planRemediation blocked: runtime paused", "remediation-planner")
  }
  const severity = deriveSeverity(failureSignal)
  const confidence = confidenceForSeverity(severity)
  const plan: RemediationPlan = {
    planId: crypto.randomUUID(),
    failureSignal,
    tenantId,
    correlationId,
    severity,
    recommendedActions: buildActions(failureSignal, severity),
    confidence,
    reasoning: `Signal '${failureSignal}' classified as ${severity}; automated response configured`,
    createdAt: new Date().toISOString(),
  }
  if (PLANS.length >= CAP) PLANS.shift()
  PLANS.push(plan)
  recordDecision("remediation", confidence)
  logger.info(`Remediation plan created severity=${severity}`, "remediation-planner", { correlationId, tenantId })
  return plan
}

export function resolveRemediationPlan(planId: string): void {
  const plan = PLANS.find((p) => p.planId === planId)
  if (plan) plan.resolvedAt = new Date().toISOString()
}

export function getOpenPlans(tenantId?: string): RemediationPlan[] {
  return PLANS.filter((p) => !p.resolvedAt && (tenantId === undefined || p.tenantId === tenantId))
}

export function getRemediationStats(): {
  total: number; open: number; resolved: number
  bySeverity: Record<string, number>; avgConfidence: number
} {
  const bySeverity: Record<string, number> = {}
  let totalConf = 0
  let resolved = 0
  for (const p of PLANS) {
    bySeverity[p.severity] = (bySeverity[p.severity] ?? 0) + 1
    totalConf += p.confidence
    if (p.resolvedAt) resolved++
  }
  return { total: PLANS.length, open: PLANS.length - resolved, resolved, bySeverity, avgConfidence: PLANS.length > 0 ? totalConf / PLANS.length : 0 }
}
