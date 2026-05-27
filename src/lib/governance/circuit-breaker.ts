/**
 * Circuit Breaker — in-memory per-key circuit breaker.
 * Prevents cascading failures by halting execution after repeated failures.
 * State resets on process restart; DB persistence is a future enhancement.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreaker {
  key: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: string | null;
  openedAt: string | null;
  threshold: number;
  resetTimeMs: number;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_RESET_TIME_MS = 60_000;

const circuits = new Map<string, CircuitBreaker>();

function createCircuit(key: string): CircuitBreaker {
  return {
    key,
    state: "closed",
    failureCount: 0,
    successCount: 0,
    lastFailureAt: null,
    openedAt: null,
    threshold: DEFAULT_THRESHOLD,
    resetTimeMs: DEFAULT_RESET_TIME_MS,
  };
}

export function getCircuit(key: string): CircuitBreaker {
  if (!circuits.has(key)) {
    circuits.set(key, createCircuit(key));
  }
  return circuits.get(key)!;
}

function maybeTransitionHalfOpen(circuit: CircuitBreaker): void {
  if (circuit.state === "open" && circuit.openedAt !== null) {
    const elapsed = Date.now() - new Date(circuit.openedAt).getTime();
    if (elapsed >= circuit.resetTimeMs) {
      circuit.state = "half-open";
      circuit.successCount = 0;
    }
  }
}

export function isOpen(key: string): boolean {
  const circuit = getCircuit(key);
  maybeTransitionHalfOpen(circuit);
  return circuit.state === "open";
}

export function recordSuccess(key: string): void {
  const circuit = getCircuit(key);
  maybeTransitionHalfOpen(circuit);
  circuit.successCount += 1;

  if (circuit.state === "half-open") {
    // Single success in half-open closes the circuit
    circuit.state = "closed";
    circuit.failureCount = 0;
    circuit.openedAt = null;
  }
}

export function recordFailure(key: string): void {
  const circuit = getCircuit(key);
  circuit.failureCount += 1;
  circuit.lastFailureAt = new Date().toISOString();

  if (circuit.state === "half-open" || circuit.failureCount >= circuit.threshold) {
    circuit.state = "open";
    circuit.openedAt = new Date().toISOString();
  }
}

/** Admin manual reset — forces circuit back to closed. */
export function resetCircuit(key: string): void {
  const fresh = createCircuit(key);
  circuits.set(key, fresh);
}

export function getAllCircuits(): CircuitBreaker[] {
  return Array.from(circuits.values());
}
