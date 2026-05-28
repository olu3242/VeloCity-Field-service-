import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type CircuitState = "closed" | "open" | "half_open"

export interface RuntimeCircuit {
  circuitId: string
  operationId: string
  tenantId?: string
  state: CircuitState
  failureCount: number
  successCount: number
  failureThreshold: number
  successThreshold: number
  lastFailureAt?: string
  openedAt?: string
  halfOpenAt?: string
  stateChangedAt: string
}

const CIRCUITS = new Map<string, RuntimeCircuit>()
const CIRCUITS_CAP = 1000

export function registerCircuit(
  operationId: string,
  failureThreshold = 5,
  successThreshold = 2,
  tenantId?: string
): RuntimeCircuit {
  if (CIRCUITS.size >= CIRCUITS_CAP) {
    const firstKey = Array.from(CIRCUITS.keys())[0]
    if (firstKey !== undefined) CIRCUITS.delete(firstKey)
  }
  const circuit: RuntimeCircuit = {
    circuitId: crypto.randomUUID(),
    operationId,
    tenantId,
    state: "closed",
    failureCount: 0,
    successCount: 0,
    failureThreshold,
    successThreshold,
    stateChangedAt: new Date().toISOString(),
  }
  CIRCUITS.set(operationId, circuit)
  return circuit
}

export function recordSuccess(operationId: string): void {
  const circuit = CIRCUITS.get(operationId)
  if (!circuit) return
  if (circuit.state === "half_open") {
    circuit.successCount++
    if (circuit.successCount >= circuit.successThreshold) {
      circuit.state = "closed"
      circuit.stateChangedAt = new Date().toISOString()
      circuit.failureCount = 0
      circuit.successCount = 0
    }
  } else if (circuit.state === "closed") {
    circuit.successCount++
  }
}

export function recordFailure(operationId: string): void {
  if (isRuntimePaused()) {
    logger.warn("recordFailure blocked: runtime paused")
    return
  }
  const circuit = CIRCUITS.get(operationId)
  if (!circuit) return
  circuit.failureCount++
  circuit.lastFailureAt = new Date().toISOString()
  if (circuit.failureCount >= circuit.failureThreshold) {
    circuit.state = "open"
    circuit.openedAt = new Date().toISOString()
    circuit.stateChangedAt = circuit.openedAt
  }
}

export function halfOpen(operationId: string): void {
  const circuit = CIRCUITS.get(operationId)
  if (!circuit || circuit.state !== "open") return
  circuit.state = "half_open"
  circuit.halfOpenAt = new Date().toISOString()
  circuit.stateChangedAt = circuit.halfOpenAt
  circuit.successCount = 0
}

export function isOpen(operationId: string): boolean {
  return CIRCUITS.get(operationId)?.state === "open"
}

export function getCircuitSummary(): {
  total: number
  closed: number
  open: number
  half_open: number
} {
  const all = Array.from(CIRCUITS.values())
  return {
    total: all.length,
    closed: all.filter((c) => c.state === "closed").length,
    open: all.filter((c) => c.state === "open").length,
    half_open: all.filter((c) => c.state === "half_open").length,
  }
}
