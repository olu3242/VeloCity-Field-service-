/**
 * Tenant-level throttling.
 */

export interface ThrottleState {
  tenantId: string;
  eventRatePerMin: number;
  aiCallRatePerMin: number;
  currentEventCount: number;
  currentAICount: number;
  windowStartMs: number;
  throttled: boolean;
  throttleReason?: string;
}

const WINDOW_MS = 60_000;
const THROTTLE_STATES = new Map<string, ThrottleState>();

export function getOrCreateThrottle(
  tenantId: string,
  eventRatePerMin: number,
  aiCallRatePerMin: number
): ThrottleState {
  const existing = THROTTLE_STATES.get(tenantId);
  const now = Date.now();

  if (existing !== undefined) {
    if (now - existing.windowStartMs > WINDOW_MS) {
      existing.currentEventCount = 0;
      existing.currentAICount = 0;
      existing.windowStartMs = now;
      existing.throttled = false;
      existing.throttleReason = undefined;
    }
    return existing;
  }

  const state: ThrottleState = {
    tenantId,
    eventRatePerMin,
    aiCallRatePerMin,
    currentEventCount: 0,
    currentAICount: 0,
    windowStartMs: now,
    throttled: false,
  };
  THROTTLE_STATES.set(tenantId, state);
  return state;
}

export function checkAndRecordEvent(
  tenantId: string,
  eventRate: number,
  aiRate: number
): { allowed: boolean; reason?: string } {
  const state = getOrCreateThrottle(tenantId, eventRate, aiRate);

  if (state.currentEventCount >= state.eventRatePerMin) {
    state.throttled = true;
    state.throttleReason = "Event rate limit exceeded";
    return { allowed: false, reason: state.throttleReason };
  }

  state.currentEventCount += 1;
  return { allowed: true };
}

export function checkAndRecordAICall(
  tenantId: string,
  eventRate: number,
  aiRate: number
): { allowed: boolean; reason?: string } {
  const state = getOrCreateThrottle(tenantId, eventRate, aiRate);

  if (state.currentAICount >= state.aiCallRatePerMin) {
    state.throttled = true;
    state.throttleReason = "AI call rate limit exceeded";
    return { allowed: false, reason: state.throttleReason };
  }

  state.currentAICount += 1;
  return { allowed: true };
}

export function getThrottledTenants(): ThrottleState[] {
  return Array.from(THROTTLE_STATES.values()).filter((s) => s.throttled);
}
