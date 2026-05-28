export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  multiplier: number
  jitterPct: number        // 0-1
  permanentErrorPatterns: string[]
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 300_000,
  multiplier: 2,
  jitterPct: 0.2,
  permanentErrorPatterns: ["400", "invalid", "not_found", "unauthorized", "forbidden"],
}

export interface RetryDecision {
  shouldRetry: boolean
  delayMs: number
  reason: string
  attemptNumber: number
}

export function computeRetryDelay(attemptNumber: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const base = policy.baseDelayMs * Math.pow(policy.multiplier, attemptNumber)
  const capped = Math.min(base, policy.maxDelayMs)
  const jitter = capped * policy.jitterPct * Math.random()
  return Math.round(capped + jitter)
}

export function shouldRetry(
  attemptNumber: number,
  errorMessage: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): RetryDecision {
  if (attemptNumber >= policy.maxAttempts) {
    return { shouldRetry: false, delayMs: 0, reason: "Max attempts exceeded", attemptNumber }
  }
  const isPermanent = policy.permanentErrorPatterns.some((p) =>
    errorMessage.toLowerCase().includes(p.toLowerCase())
  )
  if (isPermanent) {
    return { shouldRetry: false, delayMs: 0, reason: "Permanent error — no retry", attemptNumber }
  }
  return {
    shouldRetry: true,
    delayMs: computeRetryDelay(attemptNumber, policy),
    reason: "Transient error — retrying",
    attemptNumber,
  }
}

export function getRetrySchedule(maxAttempts: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number[] {
  return Array.from({ length: maxAttempts }, (_, i) => computeRetryDelay(i, policy))
}
