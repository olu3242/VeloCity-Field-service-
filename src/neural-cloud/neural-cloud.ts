import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type NeuralCloudPhase =
  | "initializing"
  | "learning"
  | "operating"
  | "evolving"
  | "degraded"

export interface NeuralCloudState {
  cloudId: string
  phase: NeuralCloudPhase
  neuralNodes: number
  activeLearningCycles: number
  totalCognitionEvents: number
  intelligenceMeshConnected: boolean
  autonomyEnabled: boolean
  cloudHealthScore: number
  startedAt: string
  lastEvolutionAt?: string
}

const CLOUD_STATE: NeuralCloudState = {
  cloudId: crypto.randomUUID(),
  phase: "initializing",
  neuralNodes: 0,
  activeLearningCycles: 0,
  totalCognitionEvents: 0,
  intelligenceMeshConnected: false,
  autonomyEnabled: false,
  cloudHealthScore: 100,
  startedAt: new Date().toISOString(),
}

export function getCloudState(): NeuralCloudState {
  return { ...CLOUD_STATE }
}

export function setPhase(phase: NeuralCloudPhase): void {
  if (isRuntimePaused()) {
    logger.warn("setPhase blocked: runtime paused", "neural-cloud")
    return
  }
  CLOUD_STATE.phase = phase
  if (phase === "evolving") {
    CLOUD_STATE.lastEvolutionAt = new Date().toISOString()
  }
  logger.info(`Neural cloud phase set to ${phase}`, "neural-cloud", {
    metadata: { cloudId: CLOUD_STATE.cloudId },
  })
}

export function registerNeuralNode(): void {
  CLOUD_STATE.neuralNodes++
  CLOUD_STATE.cloudHealthScore = getCloudHealth()
}

export function deregisterNeuralNode(): void {
  CLOUD_STATE.neuralNodes = Math.max(0, CLOUD_STATE.neuralNodes - 1)
  CLOUD_STATE.cloudHealthScore = getCloudHealth()
}

export function recordCognitionEvent(): void {
  CLOUD_STATE.totalCognitionEvents++
}

export function beginLearningCycle(): void {
  CLOUD_STATE.activeLearningCycles++
}

export function completeLearningCycle(): void {
  CLOUD_STATE.activeLearningCycles = Math.max(
    0,
    CLOUD_STATE.activeLearningCycles - 1,
  )
}

export function setAutonomyEnabled(enabled: boolean): void {
  if (isRuntimePaused()) {
    logger.warn("setAutonomyEnabled blocked: runtime paused", "neural-cloud")
    return
  }
  CLOUD_STATE.autonomyEnabled = enabled
  logger.info(`Neural cloud autonomy ${enabled ? "enabled" : "disabled"}`, "neural-cloud")
}

export function getCloudHealth(): number {
  const nodeBase = Math.min(100, CLOUD_STATE.neuralNodes * 5)
  const phaseBonus =
    CLOUD_STATE.phase === "operating" || CLOUD_STATE.phase === "evolving"
      ? 20
      : CLOUD_STATE.phase === "degraded"
        ? -30
        : 0
  return clampScore(nodeBase + phaseBonus + 50)
}
