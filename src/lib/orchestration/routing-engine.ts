export type TenantTier = "standard" | "premium" | "enterprise";

export interface RoutingDecision {
  eventType: string;
  tenantId: string;
  tenantTier: TenantTier;
  assignedWorkerId: string | null;
  priority: number;
  routingStrategy: "direct" | "queued" | "priority_lane" | "dedicated";
  estimatedDelayMs: number;
  reason: string;
}

export interface TenantTierConfig {
  tier: TenantTier;
  maxConcurrentJobs: number;
  priorityBoost: number;
  dedicatedWorker: boolean;
  executionQuota: number;
}

export const TIER_CONFIGS: Record<TenantTier, TenantTierConfig> = {
  standard: {
    tier: "standard",
    maxConcurrentJobs: 5,
    priorityBoost: 0,
    dedicatedWorker: false,
    executionQuota: 50,
  },
  premium: {
    tier: "premium",
    maxConcurrentJobs: 20,
    priorityBoost: 15,
    dedicatedWorker: false,
    executionQuota: 200,
  },
  enterprise: {
    tier: "enterprise",
    maxConcurrentJobs: 100,
    priorityBoost: 30,
    dedicatedWorker: true,
    executionQuota: 1000,
  },
};

const TENANT_TIERS = new Map<string, TenantTier>();
const RECENT_DECISIONS: RoutingDecision[] = [];

export function setTenantTier(tenantId: string, tier: TenantTier): void {
  TENANT_TIERS.set(tenantId, tier);
}

export function getTenantTier(tenantId: string): TenantTier {
  return TENANT_TIERS.get(tenantId) ?? "standard";
}

export function routeWorkload(
  eventType: string,
  tenantId: string,
  basePriority: number
): RoutingDecision {
  const tier = getTenantTier(tenantId);
  const config = TIER_CONFIGS[tier];
  const priority = Math.min(100, basePriority + config.priorityBoost);

  let routingStrategy: RoutingDecision["routingStrategy"];
  let estimatedDelayMs: number;
  let reason: string;

  if (tier === "enterprise") {
    routingStrategy = "priority_lane";
    estimatedDelayMs = 0;
    reason = "Enterprise tier — priority lane";
  } else if (priority >= 85) {
    routingStrategy = "direct";
    estimatedDelayMs = 0;
    reason = "High priority — direct routing";
  } else if (priority >= 65) {
    routingStrategy = "queued";
    estimatedDelayMs = 1000;
    reason = "Medium priority — standard queue";
  } else {
    routingStrategy = "queued";
    estimatedDelayMs = 5000;
    reason = "Low priority — deferred queue";
  }

  const decision: RoutingDecision = {
    eventType,
    tenantId,
    tenantTier: tier,
    assignedWorkerId: null,
    priority,
    routingStrategy,
    estimatedDelayMs,
    reason,
  };

  RECENT_DECISIONS.push(decision);
  if (RECENT_DECISIONS.length > 100) RECENT_DECISIONS.shift();

  return decision;
}

export function getRoutingStats(): {
  byTier: Record<TenantTier, number>;
  avgPriority: number;
} {
  const byTier: Record<TenantTier, number> = {
    standard: 0,
    premium: 0,
    enterprise: 0,
  };
  let totalPriority = 0;

  for (const d of RECENT_DECISIONS) {
    byTier[d.tenantTier]++;
    totalPriority += d.priority;
  }

  return {
    byTier,
    avgPriority:
      RECENT_DECISIONS.length > 0
        ? totalPriority / RECENT_DECISIONS.length
        : 0,
  };
}
