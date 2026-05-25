/**
 * Governance Layer — barrel export.
 * Sits between the automation event queue and handler execution.
 */

// Policies
export type { AutomationPolicy, PolicyRule } from "./policies";
export { DEFAULT_POLICIES, getPoliciesForEvent, isPolicyEnabled } from "./policies";

// Circuit Breaker
export type { CircuitState, CircuitBreaker } from "./circuit-breaker";
export {
  getCircuit,
  recordSuccess,
  recordFailure,
  isOpen,
  resetCircuit,
  getAllCircuits,
} from "./circuit-breaker";

// Safety
export type { SafetyResult } from "./safety";
export {
  checkDuplication,
  checkFloodProtection,
  checkRunawayLoop,
  checkAllSafety,
} from "./safety";

// Operator Controls
export type { OperatorState } from "./operator";
export {
  getOperatorState,
  pauseRuntime,
  resumeRuntime,
  disableAgent,
  enableAgent,
  disableEventType,
  enableEventType,
  isRuntimePaused,
  isAgentEnabled,
  isEventTypeEnabled,
} from "./operator";

// Tenant Isolation
export type { TenantIsolationResult, TenantContext } from "./tenant";
export {
  assertTenantIsolation,
  getTenantContext,
  ISOLATION_BYPASS_TENANTS,
} from "./tenant";
