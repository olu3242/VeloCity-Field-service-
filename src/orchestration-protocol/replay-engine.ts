/**
 * Replay Engine — replay-safe orchestration from checkpoints or packet logs.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ReplaySession {
  sessionId: string
  workflowId: string
  tenantId?: string
  fromCheckpointId?: string
  fromStepIndex: number
  status: "pending" | "replaying" | "completed" | "failed"
  replayedSteps: number
  startedAt: string
  completedAt?: string
  error?: string
}

const REPLAY_SESSIONS: Map<string, ReplaySession> = new Map()
const SESSIONS_CAP = 200

interface ReplayOptions {
  tenantId?: string
  fromCheckpointId?: string
  fromStepIndex?: number
}

export function createReplaySession(
  workflowId: string,
  options?: ReplayOptions
): ReplaySession {
  if (isRuntimePaused()) {
    logger.warn("createReplaySession blocked — runtime paused", "replay-engine", {
      metadata: { workflowId },
    })
  }

  if (REPLAY_SESSIONS.size >= SESSIONS_CAP) {
    const firstKey = Array.from(REPLAY_SESSIONS.keys())[0]
    if (firstKey !== undefined) REPLAY_SESSIONS.delete(firstKey)
  }

  const session: ReplaySession = {
    sessionId: crypto.randomUUID(),
    workflowId,
    tenantId: options?.tenantId,
    fromCheckpointId: options?.fromCheckpointId,
    fromStepIndex: options?.fromStepIndex ?? 0,
    status: "pending",
    replayedSteps: 0,
    startedAt: new Date().toISOString(),
  }
  REPLAY_SESSIONS.set(session.sessionId, session)
  logger.info(`Replay session created: ${session.sessionId}`, "replay-engine", {
    metadata: { workflowId, fromStepIndex: session.fromStepIndex },
  })
  return session
}

export function markReplayStep(sessionId: string): void {
  const session = REPLAY_SESSIONS.get(sessionId)
  if (!session) return
  if (session.status === "pending") session.status = "replaying"
  session.replayedSteps++
}

export function completeReplay(sessionId: string): void {
  const session = REPLAY_SESSIONS.get(sessionId)
  if (!session) return
  session.status = "completed"
  session.completedAt = new Date().toISOString()
  logger.info(`Replay completed: ${sessionId}`, "replay-engine", {
    metadata: { replayedSteps: session.replayedSteps },
  })
}

export function failReplay(sessionId: string, error: string): void {
  const session = REPLAY_SESSIONS.get(sessionId)
  if (!session) return
  session.status = "failed"
  session.error = error
  session.completedAt = new Date().toISOString()
  logger.error(`Replay failed: ${sessionId} — ${error}`, "replay-engine")
}

export function getActiveSessions(): ReplaySession[] {
  return Array.from(REPLAY_SESSIONS.values()).filter(
    (s) => s.status === "pending" || s.status === "replaying"
  )
}

export function getReplayStats(): {
  total: number
  active: number
  completed: number
  failed: number
} {
  const all = Array.from(REPLAY_SESSIONS.values())
  return {
    total: all.length,
    active: all.filter((s) => s.status === "pending" || s.status === "replaying").length,
    completed: all.filter((s) => s.status === "completed").length,
    failed: all.filter((s) => s.status === "failed").length,
  }
}
