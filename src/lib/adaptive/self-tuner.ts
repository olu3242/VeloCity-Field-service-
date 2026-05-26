// Self-tuning operational controls — adjusts runtime behavior within governance bounds.

import { isRuntimePaused } from "@/lib/governance/operator";

export interface TuningConfig {
  retryBaseDelayMs: number;
  escalationThresholdMs: number;
  queuePriorityBoostFactor: number;
  notificationBatchWindowMs: number;
  maxConcurrentAICalls: number;
}

export const DEFAULT_TUNING: TuningConfig = {
  retryBaseDelayMs: 60_000,
  escalationThresholdMs: 3_600_000,
  queuePriorityBoostFactor: 1.0,
  notificationBatchWindowMs: 30_000,
  maxConcurrentAICalls: 10,
};

export const TUNING_BOUNDS: Record<keyof TuningConfig, { min: number; max: number }> = {
  retryBaseDelayMs: { min: 10_000, max: 600_000 },
  escalationThresholdMs: { min: 300_000, max: 86_400_000 },
  queuePriorityBoostFactor: { min: 0.5, max: 3.0 },
  notificationBatchWindowMs: { min: 5_000, max: 300_000 },
  maxConcurrentAICalls: { min: 1, max: 50 },
};

interface TuningHistoryEntry {
  timestamp: string;
  field: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

const ACTIVE_CONFIG: TuningConfig = { ...DEFAULT_TUNING };
const tuningHistory: TuningHistoryEntry[] = [];
const MAX_HISTORY = 50;

export function getCurrentConfig(): TuningConfig {
  return { ...ACTIVE_CONFIG };
}

export function applyTuning(
  field: keyof TuningConfig,
  value: number,
  reason: string
): { applied: boolean; reason: string } {
  if (isRuntimePaused()) {
    return { applied: false, reason: "Runtime is paused — tuning changes not allowed" };
  }

  const bounds = TUNING_BOUNDS[field];
  if (value < bounds.min || value > bounds.max) {
    return {
      applied: false,
      reason: `Out of bounds: ${field} must be between ${bounds.min} and ${bounds.max}`,
    };
  }

  const oldValue = ACTIVE_CONFIG[field];
  ACTIVE_CONFIG[field] = value;

  const entry: TuningHistoryEntry = {
    timestamp: new Date().toISOString(),
    field,
    oldValue,
    newValue: value,
    reason,
  };
  tuningHistory.push(entry);
  if (tuningHistory.length > MAX_HISTORY) tuningHistory.shift();

  return { applied: true, reason: `Applied: ${field} changed from ${oldValue} to ${value}` };
}

export function resetToDefaults(reason: string): void {
  for (const key of Object.keys(DEFAULT_TUNING) as Array<keyof TuningConfig>) {
    const oldValue = ACTIVE_CONFIG[key];
    ACTIVE_CONFIG[key] = DEFAULT_TUNING[key];
    tuningHistory.push({
      timestamp: new Date().toISOString(),
      field: key,
      oldValue,
      newValue: DEFAULT_TUNING[key],
      reason: `reset: ${reason}`,
    });
  }
  if (tuningHistory.length > MAX_HISTORY) {
    tuningHistory.splice(0, tuningHistory.length - MAX_HISTORY);
  }
}

export function getTuningHistory(): TuningHistoryEntry[] {
  return [...tuningHistory];
}

export function explainCurrentConfig(): Record<
  keyof TuningConfig,
  { value: number; isDefault: boolean; lastChangedAt?: string }
> {
  const result = {} as Record<
    keyof TuningConfig,
    { value: number; isDefault: boolean; lastChangedAt?: string }
  >;

  for (const key of Object.keys(DEFAULT_TUNING) as Array<keyof TuningConfig>) {
    const value = ACTIVE_CONFIG[key];
    const isDefault = value === DEFAULT_TUNING[key];
    const lastChange = [...tuningHistory]
      .reverse()
      .find((h) => h.field === key);
    result[key] = {
      value,
      isDefault,
      ...(lastChange ? { lastChangedAt: lastChange.timestamp } : {}),
    };
  }

  return result;
}
