/**
 * Throttle Controller — orchestration throttling and retry pressure controls.
 */

export interface ThrottleState {
  isThrottled: boolean;
  throttleReason?: string;
  throttledAt?: string;
  targetRPS: number;
  currentRPS: number;
  burstCapacity: number;
}

export interface RetryPressureConfig {
  maxRetryRate: number;
  backoffMultiplierMs: number;
  suppressLowPriority: boolean;
}

export const DEFAULT_RETRY_PRESSURE: RetryPressureConfig = {
  maxRetryRate: 60,
  backoffMultiplierMs: 60_000,
  suppressLowPriority: false,
};

let THROTTLE_STATE: ThrottleState = {
  isThrottled: false,
  targetRPS: 100,
  currentRPS: 0,
  burstCapacity: 200,
};

let RETRY_CONFIG: RetryPressureConfig = { ...DEFAULT_RETRY_PRESSURE };

// Sliding window of request timestamps (ms)
const rpsWindow: number[] = [];

export function recordRequest(): void {
  const now = Date.now();
  rpsWindow.push(now);
  // Remove entries older than 1 second
  const cutoff = now - 1_000;
  while (rpsWindow.length > 0 && (rpsWindow[0] ?? 0) < cutoff) {
    rpsWindow.shift();
  }
  THROTTLE_STATE = { ...THROTTLE_STATE, currentRPS: rpsWindow.length };
}

export function activateThrottle(reason: string, targetRPS: number): void {
  THROTTLE_STATE = {
    ...THROTTLE_STATE,
    isThrottled: true,
    throttleReason: reason,
    throttledAt: new Date().toISOString(),
    targetRPS,
  };
}

export function deactivateThrottle(): void {
  THROTTLE_STATE = {
    ...THROTTLE_STATE,
    isThrottled: false,
    throttleReason: undefined,
    throttledAt: undefined,
  };
}

export function getThrottleState(): ThrottleState {
  return { ...THROTTLE_STATE };
}

export function updateRetryPressure(config: Partial<RetryPressureConfig>): void {
  RETRY_CONFIG = { ...RETRY_CONFIG, ...config };
}

export function getRetryPressureConfig(): RetryPressureConfig {
  return { ...RETRY_CONFIG };
}

export function shouldSuppressRetry(
  eventPriority: number,
  currentRetryRate: number
): boolean {
  return (
    RETRY_CONFIG.suppressLowPriority &&
    eventPriority < 35 &&
    currentRetryRate > RETRY_CONFIG.maxRetryRate * 0.8
  );
}
