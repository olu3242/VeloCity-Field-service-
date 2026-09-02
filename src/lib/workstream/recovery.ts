// Recovery engine: retry with exponential backoff, timeout wrappers, and fallback chains.
// The platform never crashes because one service failed — it degrades gracefully
// through the recovery ladder: retry → fallback → cached → degraded → manual.

import { WorkstreamError, toWorkstreamError } from "./errors";
import type { WorkstreamStage } from "./types";

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (attempt: number, error: WorkstreamError) => void;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exponentialDelay(attempt: number, baseMs: number, maxMs: number): number {
  const jitter = Math.random() * 100; // up to 100ms jitter
  return Math.min(baseMs * Math.pow(2, attempt - 1) + jitter, maxMs);
}

// Retry a function with exponential backoff. Only retries WorkstreamErrors where
// retryable=true; non-retryable errors are re-thrown immediately.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
  stage: WorkstreamStage = "execute",
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, onRetry } = { ...DEFAULT_RETRY, ...opts };
  let lastError: WorkstreamError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = toWorkstreamError(err);
      if (!lastError.retryable || attempt === maxAttempts) throw lastError;
      onRetry?.(attempt, lastError);
      await sleep(exponentialDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw lastError ??
    new WorkstreamError({ message: "Max retries exceeded", code: "WS_MAX_RETRIES", stage });
}

// Wrap a promise-returning function with a hard timeout.
// Throws WorkstreamError with code WS_TIMEOUT if the deadline is exceeded.
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  dependency: string,
  correlationId?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new WorkstreamError({
          message: `${dependency} timed out after ${timeoutMs}ms`,
          code: "WS_TIMEOUT",
          httpStatus: 504,
          stage: "execute",
          dependency,
          retryable: true,
          correlationId,
          suggestedActions: ["Retry", "Open Diagnostics"],
        }),
      );
    }, timeoutMs);

    fn().then(
      (r) => { clearTimeout(timer); resolve(r); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Try primary, fall back to secondary on any error.
// The onFallback callback lets callers emit a warning/log when degrading.
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  onFallback?: (err: WorkstreamError) => void,
): Promise<{ result: T; usedFallback: boolean }> {
  try {
    return { result: await primary(), usedFallback: false };
  } catch (err) {
    const wsErr = toWorkstreamError(err);
    onFallback?.(wsErr);
    return { result: await fallback(), usedFallback: true };
  }
}

// Try primary with a timeout; on failure return the degraded fallback value (may be null).
// Models the recovery ladder: Provider API Timeout → Cached Provider List → Degraded Dispatch.
export async function withDegradedMode<T>(
  primary: () => Promise<T>,
  degraded: () => Promise<T | null>,
  timeoutMs: number,
  dependency: string,
): Promise<{ result: T | null; degraded: boolean }> {
  try {
    const result = await withTimeout(primary, timeoutMs, dependency);
    return { result, degraded: false };
  } catch {
    const result = await degraded().catch(() => null);
    return { result, degraded: true };
  }
}

// Circuit-break-aware execution: skip the call entirely when the circuit is open,
// returning null. Callers can use this to show cached/static content instead.
export async function withCircuitSkip<T>(
  isOpen: boolean,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (isOpen) return null;
  return fn();
}
