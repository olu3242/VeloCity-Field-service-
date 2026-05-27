export interface QuotaConfig {
  tenantId: string;
  hourlyEventLimit: number;
  hourlyAICallLimit: number;
  dailyAITokenBudget: number;
  concurrentWorkflowLimit: number;
}

export interface QuotaUsage {
  tenantId: string;
  hourlyEvents: number;
  hourlyAICalls: number;
  dailyAITokens: number;
  activeWorkflows: number;
  resetAt: string;
}

export const DEFAULT_QUOTAS: Omit<QuotaConfig, "tenantId"> = {
  hourlyEventLimit: 1000,
  hourlyAICallLimit: 200,
  dailyAITokenBudget: 1_000_000,
  concurrentWorkflowLimit: 10,
};

const QUOTAS = new Map<string, QuotaConfig>();
const USAGE = new Map<string, QuotaUsage>();

export function setQuota(config: QuotaConfig): void {
  QUOTAS.set(config.tenantId, config);
}

export function getQuota(tenantId: string): QuotaConfig {
  return QUOTAS.get(tenantId) ?? { tenantId, ...DEFAULT_QUOTAS };
}

function nextHourReset(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return now.toISOString();
}

export function getUsage(tenantId: string): QuotaUsage {
  if (!USAGE.has(tenantId)) {
    USAGE.set(tenantId, {
      tenantId,
      hourlyEvents: 0,
      hourlyAICalls: 0,
      dailyAITokens: 0,
      activeWorkflows: 0,
      resetAt: nextHourReset(),
    });
  }
  return USAGE.get(tenantId)!;
}

export function recordUsage(
  tenantId: string,
  type: "event" | "ai_call" | "ai_tokens" | "workflow_start",
  amount?: number
): void {
  const usage = getUsage(tenantId);
  const delta = amount ?? 1;
  switch (type) {
    case "event":
      usage.hourlyEvents += delta;
      break;
    case "ai_call":
      usage.hourlyAICalls += delta;
      break;
    case "ai_tokens":
      usage.dailyAITokens += delta;
      break;
    case "workflow_start":
      usage.activeWorkflows += delta;
      break;
  }
  USAGE.set(tenantId, usage);
}

export function checkQuota(
  tenantId: string,
  type: "event" | "ai_call" | "ai_tokens" | "workflow"
): { allowed: boolean; remaining: number; reason?: string } {
  const quota = getQuota(tenantId);
  const usage = getUsage(tenantId);

  switch (type) {
    case "event": {
      const remaining = quota.hourlyEventLimit - usage.hourlyEvents;
      return remaining > 0
        ? { allowed: true, remaining }
        : { allowed: false, remaining: 0, reason: "Hourly event limit reached" };
    }
    case "ai_call": {
      const remaining = quota.hourlyAICallLimit - usage.hourlyAICalls;
      return remaining > 0
        ? { allowed: true, remaining }
        : { allowed: false, remaining: 0, reason: "Hourly AI call limit reached" };
    }
    case "ai_tokens": {
      const remaining = quota.dailyAITokenBudget - usage.dailyAITokens;
      return remaining > 0
        ? { allowed: true, remaining }
        : { allowed: false, remaining: 0, reason: "Daily AI token budget exhausted" };
    }
    case "workflow": {
      const remaining = quota.concurrentWorkflowLimit - usage.activeWorkflows;
      return remaining > 0
        ? { allowed: true, remaining }
        : { allowed: false, remaining: 0, reason: "Concurrent workflow limit reached" };
    }
  }
}

export function resetHourlyUsage(): void {
  Array.from(USAGE.entries()).forEach(([tenantId, usage]) => {
    USAGE.set(tenantId, {
      ...usage,
      hourlyEvents: 0,
      hourlyAICalls: 0,
      resetAt: nextHourReset(),
    });
  });
}
