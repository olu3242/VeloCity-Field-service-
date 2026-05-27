export interface WorkflowOptimization {
  workflowType: string
  currentAvgMs: number
  optimizedAvgMs: number
  improvementPct: number
  technique: "parallel_steps" | "cache_lookup" | "skip_redundant" | "fast_path"
  appliedAt?: string
  applied: boolean
}

const OPTS: Map<string, WorkflowOptimization> = new Map()

export function analyzeWorkflow(workflowType: string, stepTimings: number[]): WorkflowOptimization {
  const currentAvgMs = stepTimings.length > 0
    ? stepTimings.reduce((a, b) => a + b, 0) / stepTimings.length
    : 0

  let technique: WorkflowOptimization["technique"]
  let savingsPct: number

  if (stepTimings.length > 5) {
    technique = "parallel_steps"
    savingsPct = 0.3
  } else if (stepTimings.some(t => t > 5000)) {
    technique = "cache_lookup"
    savingsPct = 0.4
  } else {
    technique = "fast_path"
    savingsPct = 0.15
  }

  const optimizedAvgMs = currentAvgMs * (1 - savingsPct)
  const improvementPct = savingsPct * 100

  const existing = OPTS.get(workflowType)
  const opt: WorkflowOptimization = {
    workflowType,
    currentAvgMs,
    optimizedAvgMs,
    improvementPct,
    technique,
    applied: existing?.applied ?? false,
    appliedAt: existing?.appliedAt,
  }
  OPTS.set(workflowType, opt)
  return opt
}

export function applyOptimization(workflowType: string): void {
  const opt = OPTS.get(workflowType)
  if (!opt) return
  opt.applied = true
  opt.appliedAt = new Date().toISOString()
}

export function getAppliedOptimizations(): WorkflowOptimization[] {
  return Array.from(OPTS.values()).filter(o => o.applied)
}

export function getOptimizationImpact(): {
  totalWorkflows: number
  avgImprovementPct: number
  totalMsSaved: number
} {
  const applied = Array.from(OPTS.values()).filter(o => o.applied)
  const totalMsSaved = applied.reduce((s, o) => s + (o.currentAvgMs - o.optimizedAvgMs), 0)
  const avgImprovementPct = applied.length > 0
    ? applied.reduce((s, o) => s + o.improvementPct, 0) / applied.length
    : 0
  return {
    totalWorkflows: OPTS.size,
    avgImprovementPct,
    totalMsSaved,
  }
}
