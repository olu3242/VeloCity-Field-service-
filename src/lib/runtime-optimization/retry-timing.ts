export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterFactor: number;
  maxRetries: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason: string;
  attemptNumber: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelayMs: 1_000,
  maxDelayMs: 300_000,
  multiplier: 2,
  jitterFactor: 0.2,
  maxRetries: 5,
};

function mergeConfig(config?: Partial<RetryConfig>): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, ...config };
}

const PERMANENT_ERROR_PATTERNS = ["400", "invalid", "not_found"];

export function calculateRetryDelay(
  attempt: number,
  config?: Partial<RetryConfig>
): number {
  const cfg = mergeConfig(config);
  const delay = cfg.baseDelayMs * Math.pow(cfg.multiplier, attempt);
  const jitter = delay * cfg.jitterFactor * Math.random();
  return Math.round(Math.min(cfg.maxDelayMs, delay + jitter));
}

export function shouldRetry(
  attempt: number,
  error: string,
  config?: Partial<RetryConfig>
): RetryDecision {
  const cfg = mergeConfig(config);

  if (attempt >= cfg.maxRetries) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: "Max retries exceeded",
      attemptNumber: attempt,
    };
  }

  const lowerError = error.toLowerCase();
  const isPermanent = PERMANENT_ERROR_PATTERNS.some((p) =>
    lowerError.includes(p)
  );
  if (isPermanent) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: "Permanent error — no retry",
      attemptNumber: attempt,
    };
  }

  return {
    shouldRetry: true,
    delayMs: calculateRetryDelay(attempt, config),
    reason: "Transient error — retrying",
    attemptNumber: attempt,
  };
}

export function getRetrySchedule(
  maxAttempts: number,
  config?: Partial<RetryConfig>
): number[] {
  return Array.from({ length: maxAttempts }, (_, i) =>
    calculateRetryDelay(i, config)
  );
}
