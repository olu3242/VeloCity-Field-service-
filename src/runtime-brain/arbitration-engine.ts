import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordDecision } from "./runtime-brain"

export interface ArbitrationCase {
  caseId: string
  conflictType: string
  tenantId?: string
  candidates: {
    candidateId: string
    source: string
    recommendation: string
    confidence: number
    priority: number
  }[]
  winner?: string
  winReason?: string
  status: "open" | "resolved" | "escalated"
  createdAt: string
  resolvedAt?: string
}

const CASES: ArbitrationCase[] = []
const CAP = 300

export function openCase(
  conflictType: string,
  candidates: ArbitrationCase["candidates"],
  tenantId?: string,
): ArbitrationCase {
  if (isRuntimePaused()) {
    logger.warn("openCase blocked: runtime paused", "arbitration-engine")
  }
  const arbitrationCase: ArbitrationCase = {
    caseId: crypto.randomUUID(),
    conflictType,
    tenantId,
    candidates,
    status: "open",
    createdAt: new Date().toISOString(),
  }
  if (CASES.length >= CAP) CASES.shift()
  CASES.push(arbitrationCase)
  logger.info(`Arbitration case opened: ${conflictType}`, "arbitration-engine", { tenantId })
  return arbitrationCase
}

export function resolveCase(caseId: string): ArbitrationCase {
  const arbitrationCase = CASES.find((c) => c.caseId === caseId)
  if (!arbitrationCase) throw new Error(`ArbitrationCase not found: ${caseId}`)
  if (isRuntimePaused()) {
    logger.warn("resolveCase blocked: runtime paused", "arbitration-engine")
  }
  let bestScore = -Infinity
  let winner: ArbitrationCase["candidates"][number] | undefined
  for (const candidate of arbitrationCase.candidates) {
    const score = candidate.confidence * candidate.priority
    if (score > bestScore) {
      bestScore = score
      winner = candidate
    }
  }
  arbitrationCase.winner = winner?.candidateId
  arbitrationCase.winReason = "Highest confidence-weighted priority score"
  arbitrationCase.status = "resolved"
  arbitrationCase.resolvedAt = new Date().toISOString()
  recordDecision("orchestration", winner?.confidence ?? 0.5)
  logger.info(`Arbitration case resolved: winner=${arbitrationCase.winner}`, "arbitration-engine")
  return arbitrationCase
}

export function escalateCase(caseId: string): void {
  const arbitrationCase = CASES.find((c) => c.caseId === caseId)
  if (arbitrationCase) {
    arbitrationCase.status = "escalated"
    logger.warn(`Arbitration case escalated: ${caseId}`, "arbitration-engine")
  }
}

export function getOpenCases(tenantId?: string): ArbitrationCase[] {
  return CASES.filter(
    (c) => c.status === "open" && (tenantId === undefined || c.tenantId === tenantId),
  )
}

export function getArbitrationStats(): {
  total: number; resolved: number; escalated: number; avgCandidatesPerCase: number
} {
  let resolved = 0, escalated = 0, totalCandidates = 0
  for (const c of CASES) {
    if (c.status === "resolved") resolved++
    else if (c.status === "escalated") escalated++
    totalCandidates += c.candidates.length
  }
  return {
    total: CASES.length, resolved, escalated,
    avgCandidatesPerCase: CASES.length > 0 ? totalCandidates / CASES.length : 0,
  }
}
