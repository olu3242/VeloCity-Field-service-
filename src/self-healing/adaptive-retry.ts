import { logger } from "@/runtime-core/observability"

export type BackoffStrategy = "linear" | "exponential" | "jitter" | "fibonacci"

export interface RetryPlan {
  planId: string
  operationId: string
  tenantId?: string
  strategy: BackoffStrategy
  maxAttempts: number
  baseDelayMs: number
  attempts: { attempt: number; delayMs: number; outcome: "pending" | "success" | "failure" }[]
  currentAttempt: number
  completed: boolean
  createdAt: string
}

const PLANS = new Map<string, RetryPlan>()
const PLANS_CAP = 1000

const FIB_TABLE = [1, 1, 2, 3, 5, 8, 13]

function fib(n: number): number {
  return FIB_TABLE[Math.min(n, 6)]
}

export function createRetryPlan(
  operationId: string,
  strategy: BackoffStrategy,
  maxAttempts: number,
  baseDelayMs: number,
  tenantId?: string
): RetryPlan {
  if (PLANS.size >= PLANS_CAP) {
    const firstKey = Array.from(PLANS.keys())[0]
    if (firstKey !== undefined) PLANS.delete(firstKey)
  }
  const plan: RetryPlan = {
    planId: crypto.randomUUID(),
    operationId,
    tenantId,
    strategy,
    maxAttempts,
    baseDelayMs,
    attempts: [],
    currentAttempt: 0,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  PLANS.set(plan.planId, plan)
  return plan
}

export function getNextDelay(planId: string): number {
  const plan = PLANS.get(planId)
  if (!plan) return 0
  const attempt = plan.currentAttempt
  const base = plan.baseDelayMs
  switch (plan.strategy) {
    case "linear":
      return base * attempt
    case "exponential":
      return base * Math.pow(2, attempt)
    case "jitter":
      return base + Math.random() * base * 0.5
    case "fibonacci":
      return base * fib(attempt)
    default:
      logger.warn("Unknown backoff strategy")
      return base
  }
}

export function recordAttemptOutcome(
  planId: string,
  outcome: "success" | "failure"
): void {
  const plan = PLANS.get(planId)
  if (!plan) return
  const delayMs = getNextDelay(planId)
  plan.attempts.push({ attempt: plan.currentAttempt, delayMs, outcome })
  plan.currentAttempt++
  if (outcome === "success" || plan.currentAttempt >= plan.maxAttempts) {
    plan.completed = true
  }
}

export function getActivePlans(tenantId?: string): RetryPlan[] {
  return Array.from(PLANS.values()).filter(
    (p) => !p.completed && (tenantId === undefined || p.tenantId === tenantId)
  )
}

export function getRetrySummary(): {
  total: number
  completed: number
  avgAttempts: number
  byStrategy: Record<string, number>
} {
  const all = Array.from(PLANS.values())
  const total = all.length
  const completed = all.filter((p) => p.completed).length
  const avgAttempts = total > 0 ? all.reduce((s, p) => s + p.currentAttempt, 0) / total : 0
  const byStrategy: Record<string, number> = {}
  for (const p of all) {
    byStrategy[p.strategy] = (byStrategy[p.strategy] ?? 0) + 1
  }
  return { total, completed, avgAttempts, byStrategy }
}
