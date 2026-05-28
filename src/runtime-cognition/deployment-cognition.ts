import { logger } from "@/runtime-core/observability"

export interface DeploymentCognition {
  cognitionId: string
  workflowType?: string
  strategy: string
  tenantId?: string
  historicalSuccessRate: number
  avgDeploymentMinutes: number
  learnedRisks: string[]
  mitigationPatterns: string[]
  cognitiveConfidence: number
  deploymentsSeen: number
  lastUpdatedAt: string
}

const COGNITIONS: Map<string, DeploymentCognition> = new Map()
const MAX_COGNITIONS = 200

const DEFAULT_MITIGATIONS: Record<string, string[]> = {
  blue_green: ["pre_validation", "traffic_shift_gradual"],
  canary: ["monitor_error_rate", "rollback_on_threshold"],
  rolling: ["health_check_gate", "surge_capacity"],
  recreate: ["maintenance_window", "backup_first"],
}

export function learnDeployment(
  strategy: string,
  success: boolean,
  durationMinutes: number,
  risks: string[],
  workflowType?: string,
  tenantId?: string,
): DeploymentCognition {
  if (COGNITIONS.size >= MAX_COGNITIONS && !COGNITIONS.has(strategy)) {
    const firstKey = Array.from(COGNITIONS.keys())[0]
    if (firstKey !== undefined) COGNITIONS.delete(firstKey)
  }

  const existing = COGNITIONS.get(strategy)
  const cognition: DeploymentCognition = existing ?? {
    cognitionId: crypto.randomUUID(),
    workflowType,
    strategy,
    tenantId,
    historicalSuccessRate: 0,
    avgDeploymentMinutes: 0,
    learnedRisks: [],
    mitigationPatterns: DEFAULT_MITIGATIONS[strategy] ?? [],
    cognitiveConfidence: 0,
    deploymentsSeen: 0,
    lastUpdatedAt: new Date().toISOString(),
  }

  const n = cognition.deploymentsSeen
  cognition.historicalSuccessRate = (cognition.historicalSuccessRate * n + (success ? 1 : 0)) / (n + 1)
  cognition.avgDeploymentMinutes = (cognition.avgDeploymentMinutes * n + durationMinutes) / (n + 1)
  cognition.deploymentsSeen += 1

  for (const risk of risks) {
    if (!cognition.learnedRisks.includes(risk) && cognition.learnedRisks.length < 10) {
      cognition.learnedRisks.push(risk)
    }
  }

  cognition.cognitiveConfidence = Math.min(0.99, cognition.deploymentsSeen / 20)
  cognition.lastUpdatedAt = new Date().toISOString()

  COGNITIONS.set(strategy, cognition)
  logger.info(`Deployment cognition updated for strategy: ${strategy}`, "deployment-cognition", {
    tenantId, metadata: { strategy, success, durationMinutes },
  })
  return cognition
}

export function getMitigationPatterns(strategy: string): string[] {
  return COGNITIONS.get(strategy)?.mitigationPatterns ?? DEFAULT_MITIGATIONS[strategy] ?? []
}

export function getCognitionForStrategy(strategy: string): DeploymentCognition | undefined {
  return COGNITIONS.get(strategy)
}

export function getDeploymentSummary(): { total: number; avgSuccessRate: number; avgConfidence: number } {
  const values = Array.from(COGNITIONS.values())
  const total = values.length
  const avgSuccessRate = total > 0 ? values.reduce((s, c) => s + c.historicalSuccessRate, 0) / total : 0
  const avgConfidence = total > 0 ? values.reduce((s, c) => s + c.cognitiveConfidence, 0) / total : 0
  return { total, avgSuccessRate, avgConfidence }
}
