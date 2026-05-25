/**
 * Operator Controls — runtime kill switches and per-agent/event-type toggles.
 *
 * NOTE: All state is in-memory and resets on process restart.
 * Persistence (e.g. saving pause state to DB) is a future enhancement.
 */

export interface OperatorState {
  runtimePaused: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
  pauseReason: string | null;
  disabledAgents: Set<string>;
  disabledEventTypes: Set<string>;
}

const state: OperatorState = {
  runtimePaused: false,
  pausedAt: null,
  pausedBy: null,
  pauseReason: null,
  disabledAgents: new Set<string>(),
  disabledEventTypes: new Set<string>(),
};

/** Returns a snapshot of current operator state. */
export function getOperatorState(): OperatorState {
  return { ...state, disabledAgents: new Set(state.disabledAgents), disabledEventTypes: new Set(state.disabledEventTypes) };
}

/** Pause the entire automation runtime. All events will be held. */
export function pauseRuntime(adminId: string, reason: string): void {
  state.runtimePaused = true;
  state.pausedAt = new Date().toISOString();
  state.pausedBy = adminId;
  state.pauseReason = reason;
}

/** Resume the automation runtime after a pause. */
export function resumeRuntime(adminId: string): void {
  void adminId; // logged by caller
  state.runtimePaused = false;
  state.pausedAt = null;
  state.pausedBy = null;
  state.pauseReason = null;
}

/** Disable a specific agent by name (e.g. "ivy-dispute", "finn-payment"). */
export function disableAgent(agentName: string): void {
  state.disabledAgents.add(agentName);
}

/** Re-enable a previously disabled agent. */
export function enableAgent(agentName: string): void {
  state.disabledAgents.delete(agentName);
}

/** Disable processing of a specific event type. */
export function disableEventType(eventType: string): void {
  state.disabledEventTypes.add(eventType);
}

/** Re-enable a previously disabled event type. */
export function enableEventType(eventType: string): void {
  state.disabledEventTypes.delete(eventType);
}

export function isRuntimePaused(): boolean {
  return state.runtimePaused;
}

/** Returns true if the agent is NOT disabled. */
export function isAgentEnabled(agentName: string): boolean {
  return !state.disabledAgents.has(agentName);
}

/** Returns true if the event type is NOT disabled. */
export function isEventTypeEnabled(eventType: string): boolean {
  return !state.disabledEventTypes.has(eventType);
}
