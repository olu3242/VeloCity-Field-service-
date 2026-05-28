import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { transitionStatus } from "./workflow-state"

export interface ResumeSignal {
  signalId: string
  workflowId: string
  tenantId?: string
  signalType:
    | "human_approval"
    | "human_rejection"
    | "timeout_override"
    | "operator_resume"
    | "external_event"
  payload: Record<string, unknown>
  signalledBy: string
  receivedAt: string
  processedAt?: string
  status: "pending" | "processed" | "expired"
}

const RESUME_SIGNALS: ResumeSignal[] = []
const SIGNALS_CAP = 1000

export function sendResumeSignal(
  workflowId: string,
  type: ResumeSignal["signalType"],
  payload: Record<string, unknown>,
  signalledBy: string,
  tenantId?: string,
): ResumeSignal {
  if (isRuntimePaused()) {
    logger.warn("sendResumeSignal blocked: runtime is paused", "workflow-resume", {
      metadata: { workflowId },
    })
    throw new Error("Runtime is paused — resume signal blocked")
  }
  if (RESUME_SIGNALS.length >= SIGNALS_CAP) RESUME_SIGNALS.shift()
  const signal: ResumeSignal = {
    signalId: crypto.randomUUID(),
    workflowId,
    tenantId,
    signalType: type,
    payload,
    signalledBy,
    receivedAt: new Date().toISOString(),
    status: "pending",
  }
  RESUME_SIGNALS.push(signal)
  logger.info(`Resume signal received: ${type}`, "workflow-resume", {
    metadata: { signalId: signal.signalId, workflowId, signalledBy },
  })
  return signal
}

export function processSignal(signalId: string): void {
  const signal = RESUME_SIGNALS.find((s) => s.signalId === signalId)
  if (!signal || signal.status !== "pending") return
  signal.status = "processed"
  signal.processedAt = new Date().toISOString()
  try {
    transitionStatus(signal.workflowId, "running")
    logger.info("Signal processed — workflow resumed", "workflow-resume", {
      metadata: { signalId, workflowId: signal.workflowId },
    })
  } catch (err: unknown) {
    logger.error(
      `Failed to transition workflow: ${err instanceof Error ? err.message : String(err)}`,
      "workflow-resume",
      { metadata: { signalId } },
    )
  }
}

export function getPendingSignals(workflowId: string): ResumeSignal[] {
  return RESUME_SIGNALS.filter((s) => s.workflowId === workflowId && s.status === "pending")
}

export function getSignalHistory(workflowId: string): ResumeSignal[] {
  return RESUME_SIGNALS.filter((s) => s.workflowId === workflowId)
}

export function getSignalSummary(): {
  total: number
  pending: number
  processed: number
  expired: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  let pending = 0
  let processed = 0
  let expired = 0
  for (const s of RESUME_SIGNALS) {
    byType[s.signalType] = (byType[s.signalType] ?? 0) + 1
    if (s.status === "pending") pending++
    else if (s.status === "processed") processed++
    else expired++
  }
  return { total: RESUME_SIGNALS.length, pending, processed, expired, byType }
}
