import { isRuntimePaused } from "@/lib/governance/operator"

export interface ActionSuggestion {
  id: string
  context: string
  suggestedAction: string
  rationale: string
  priority: "low" | "medium" | "high" | "urgent"
  estimatedImpact: string
  requiresApproval: boolean
  generatedAt: string
}

const SUGGESTIONS: ActionSuggestion[] = []
const CAP = 200
const dismissed = new Set<string>()

export function generateSuggestion(
  context: string,
  params: { openCircuits: number; degradedComponents: number; queueDepth: number; errorRate: number }
): ActionSuggestion {
  let suggestedAction: string
  let rationale: string
  let priority: ActionSuggestion["priority"]
  let estimatedImpact: string
  let requiresApproval: boolean

  if (params.openCircuits > 2) {
    suggestedAction = "Investigate and reset open circuits"
    rationale = `${params.openCircuits} circuits are open, indicating cascading failures`
    priority = "urgent"
    estimatedImpact = "Restore 60-80% of degraded traffic flows"
    requiresApproval = true
  } else if (params.queueDepth > 500) {
    suggestedAction = "Drain excess queue depth"
    rationale = `Queue depth at ${params.queueDepth} exceeds safe threshold of 500`
    priority = "high"
    estimatedImpact = "Reduce processing backlog by 40-60%"
    requiresApproval = false
  } else if (params.errorRate > 0.1) {
    suggestedAction = "Rollback canary deployment"
    rationale = `Error rate of ${(params.errorRate * 100).toFixed(1)}% exceeds 10% threshold`
    priority = "urgent"
    estimatedImpact = "Restore error rate below 2% within 5 minutes"
    requiresApproval = true
  } else {
    suggestedAction = "Review monitoring dashboards"
    rationale = "No critical signals detected; routine review recommended"
    priority = "low"
    estimatedImpact = "Maintain current operational health baseline"
    requiresApproval = false
  }

  const suggestion: ActionSuggestion = {
    id: crypto.randomUUID(),
    context,
    suggestedAction,
    rationale,
    priority,
    estimatedImpact,
    requiresApproval,
    generatedAt: new Date().toISOString(),
  }

  if (SUGGESTIONS.length >= CAP) SUGGESTIONS.shift()
  SUGGESTIONS.push(suggestion)
  return suggestion
}

export function getActiveSuggestions(priority?: ActionSuggestion["priority"]): ActionSuggestion[] {
  const active = SUGGESTIONS.filter(s => !dismissed.has(s.id))
  if (priority !== undefined) return active.filter(s => s.priority === priority)
  return active
}

export function dismissSuggestion(id: string): void {
  if (isRuntimePaused()) return
  dismissed.add(id)
}
