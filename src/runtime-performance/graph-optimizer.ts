import { clampScore } from "@/runtime-core/scoring"

export interface GraphOptimization {
  optimizationId: string
  graphId: string
  tenantId?: string
  technique: "memoization" | "path_compression" | "parallel_batch" | "pruning" | "index_build"
  nodesBeforeOpt: number
  nodesAfterOpt: number
  reductionPct: number
  estimatedLatencyGainMs: number
  appliedAt: string
}

const OPTIMIZATIONS: GraphOptimization[] = []
const CAP = 500

function computeNodesAfter(
  technique: GraphOptimization["technique"],
  nodeCount: number,
): number {
  switch (technique) {
    case "memoization":    return nodeCount
    case "path_compression": return Math.ceil(nodeCount * 0.7)
    case "parallel_batch": return nodeCount
    case "pruning":        return Math.ceil(nodeCount * 0.6)
    case "index_build":   return nodeCount
  }
}

export function optimizeGraph(
  graphId: string,
  technique: GraphOptimization["technique"],
  nodeCount: number,
  tenantId?: string,
): GraphOptimization {
  const nodesAfterOpt = computeNodesAfter(technique, nodeCount)
  const reductionPct = clampScore(
    (1 - nodesAfterOpt / Math.max(1, nodeCount)) * 100,
  )
  const opt: GraphOptimization = {
    optimizationId: crypto.randomUUID(),
    graphId,
    tenantId,
    technique,
    nodesBeforeOpt: nodeCount,
    nodesAfterOpt,
    reductionPct,
    estimatedLatencyGainMs: reductionPct * 2,
    appliedAt: new Date().toISOString(),
  }
  if (OPTIMIZATIONS.length >= CAP) OPTIMIZATIONS.shift()
  OPTIMIZATIONS.push(opt)
  return opt
}

export function getOptimizationsForGraph(graphId: string): GraphOptimization[] {
  return OPTIMIZATIONS.filter((o) => o.graphId === graphId)
}

export function getOptimizationSummary(): {
  total: number
  byTechnique: Record<string, number>
  avgReductionPct: number
  totalLatencyGainMs: number
} {
  const byTechnique: Record<string, number> = {}
  let totalReduction = 0
  let totalLatency = 0
  for (const o of OPTIMIZATIONS) {
    byTechnique[o.technique] = (byTechnique[o.technique] ?? 0) + 1
    totalReduction += o.reductionPct
    totalLatency += o.estimatedLatencyGainMs
  }
  const total = OPTIMIZATIONS.length
  return {
    total,
    byTechnique,
    avgReductionPct: total > 0 ? totalReduction / total : 0,
    totalLatencyGainMs: totalLatency,
  }
}
