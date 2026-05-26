/**
 * Digital Twin — in-memory operational model of the VeloCity platform.
 * Captures state snapshots for monitoring and what-if analysis.
 */

export interface TwinState {
  queueDepth: number;
  processingWorkers: number;
  aiCallsPerMinute: number;
  disputeOpenCount: number;
  payoutPendingCents: number;
  activeProviders: number;
  slaBreachRisk: "low" | "medium" | "high" | "critical";
  timestamp: string;
}

export interface TwinConfig {
  avgProcessingTimeMs: number;
  workerCount: number;
  aiCallCapacity: number;
  slaThresholdMs: number;
  tenantCount: number;
}

export const DEFAULT_TWIN_CONFIG: TwinConfig = {
  avgProcessingTimeMs: 2_000,
  workerCount: 1,
  aiCallCapacity: 100,
  slaThresholdMs: 1_800_000,
  tenantCount: 1,
};

let TWIN_CONFIG: TwinConfig = { ...DEFAULT_TWIN_CONFIG };
const STATE_HISTORY: TwinState[] = [];
const MAX_HISTORY = 1_000;

export function updateTwinConfig(partial: Partial<TwinConfig>): void {
  TWIN_CONFIG = { ...TWIN_CONFIG, ...partial };
}

export function getTwinConfig(): TwinConfig {
  return { ...TWIN_CONFIG };
}

function computeSlaRisk(queueDepth: number, workerCount: number): TwinState["slaBreachRisk"] {
  if (queueDepth > workerCount * 50) return "critical";
  if (queueDepth > 20) return "high";
  if (queueDepth > 5) return "medium";
  return "low";
}

export function captureState(
  state: Omit<TwinState, "timestamp" | "slaBreachRisk">
): TwinState {
  const full: TwinState = {
    ...state,
    slaBreachRisk: computeSlaRisk(state.queueDepth, TWIN_CONFIG.workerCount),
    timestamp: new Date().toISOString(),
  };
  if (STATE_HISTORY.length >= MAX_HISTORY) {
    STATE_HISTORY.shift();
  }
  STATE_HISTORY.push(full);
  return full;
}

export function getLatestState(): TwinState | null {
  return STATE_HISTORY.length > 0 ? (STATE_HISTORY[STATE_HISTORY.length - 1] ?? null) : null;
}

export function getStateHistory(limit?: number): TwinState[] {
  if (limit === undefined) return [...STATE_HISTORY];
  return STATE_HISTORY.slice(-limit);
}
