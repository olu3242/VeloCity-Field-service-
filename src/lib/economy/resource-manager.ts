export interface ExecutionCost {
  agentName: string;
  tenantId: string;
  tokensUsed: number;
  latencyMs: number;
  estimatedCostUsd: number;
  timestamp: string;
}

export interface ResourceBudget {
  tenantId: string;
  dailyTokenBudget: number;
  dailyTokenUsed: number;
  hourlyCallLimit: number;
  hourlyCallCount: number;
  lastResetAt: string;
}

// Claude Sonnet pricing (approximate): $3/1M input + $15/1M output tokens
const COST_PER_TOKEN_USD = 0.000009; // blended average

const COST_LEDGER: ExecutionCost[] = [];
const BUDGETS = new Map<string, ResourceBudget>();

export function recordExecution(
  agentName: string,
  tenantId: string,
  tokensUsed: number,
  latencyMs: number
): ExecutionCost {
  const entry: ExecutionCost = {
    agentName,
    tenantId,
    tokensUsed,
    latencyMs,
    estimatedCostUsd: tokensUsed * COST_PER_TOKEN_USD,
    timestamp: new Date().toISOString(),
  };
  COST_LEDGER.push(entry);
  return entry;
}

export function getOrCreateBudget(tenantId: string): ResourceBudget {
  const existing = BUDGETS.get(tenantId);
  if (existing) {
    const ageMs = Date.now() - new Date(existing.lastResetAt).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) return existing;
  }

  const budget: ResourceBudget = {
    tenantId,
    dailyTokenBudget: 1_000_000,
    dailyTokenUsed: 0,
    hourlyCallLimit: 200,
    hourlyCallCount: 0,
    lastResetAt: new Date().toISOString(),
  };
  BUDGETS.set(tenantId, budget);
  return budget;
}

export function checkBudget(
  tenantId: string,
  estimatedTokens: number
): { allowed: boolean; reason?: string } {
  const budget = getOrCreateBudget(tenantId);

  if (budget.dailyTokenUsed + estimatedTokens > budget.dailyTokenBudget) {
    return { allowed: false, reason: "Daily token budget exceeded" };
  }
  if (budget.hourlyCallCount >= budget.hourlyCallLimit) {
    return { allowed: false, reason: "Hourly call limit exceeded" };
  }
  return { allowed: true };
}

export function getCostReport(tenantId?: string): {
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  avgCostPerCall: number;
  byAgent: Record<string, number>;
} {
  const entries = tenantId
    ? COST_LEDGER.filter((e) => e.tenantId === tenantId)
    : COST_LEDGER;

  const byAgent: Record<string, number> = {};
  let totalCostUsd = 0;
  let totalTokens = 0;

  for (const e of entries) {
    totalCostUsd += e.estimatedCostUsd;
    totalTokens += e.tokensUsed;
    byAgent[e.agentName] = (byAgent[e.agentName] ?? 0) + e.estimatedCostUsd;
  }

  return {
    totalCostUsd,
    totalTokens,
    totalCalls: entries.length,
    avgCostPerCall: entries.length > 0 ? totalCostUsd / entries.length : 0,
    byAgent,
  };
}
