// Queue, dispute, and payout cost analytics.

export interface QueueCostMetrics {
  totalItems: number;
  failedItems: number;
  retryItems: number;
  estimatedCostPerItem: number;
  retryOverheadCostCents: number;
  wastedCostCents: number;
  efficiencyRate: number;
}

export interface DisputeCostMetrics {
  openDisputes: number;
  avgResolutionDays: number;
  estimatedOpsHoursPerDispute: number;
  estimatedCostPerDispute: number;
  totalDisputeCostUsd: number;
  automatedResolutionRate: number;
  costSavedByAutomationUsd: number;
}

export interface PayoutEfficiencyMetrics {
  totalPayoutsProcessed: number;
  autoReleasedCount: number;
  manualReviewCount: number;
  avgProcessingDays: number;
  providerSatisfactionImpact: number;
  automationRate: number;
}

const DEFAULT_COST_PER_ITEM_CENTS = 5;
const OPS_HOURS_PER_DISPUTE = 2;
const LABOR_RATE_USD = 35;
const AUTOMATION_SAVINGS_FACTOR = 0.8;
const MAX_SATISFACTION_DAYS = 14;

export function analyzeQueueCosts(input: {
  total: number;
  failed: number;
  retries: number;
  costPerItemCents?: number;
}): QueueCostMetrics {
  const costPerItem = input.costPerItemCents ?? DEFAULT_COST_PER_ITEM_CENTS;
  const retryOverheadCostCents = input.retries * costPerItem * 1.5;
  const wastedCostCents = input.failed * costPerItem;
  const efficiencyRate =
    input.total > 0 ? 1 - input.failed / input.total : 1;

  return {
    totalItems: input.total,
    failedItems: input.failed,
    retryItems: input.retries,
    estimatedCostPerItem: costPerItem,
    retryOverheadCostCents,
    wastedCostCents,
    efficiencyRate,
  };
}

export function analyzeDisputeCosts(input: {
  openDisputes: number;
  avgResolutionDays: number;
  automatedRate: number;
}): DisputeCostMetrics {
  const estimatedOpsHoursPerDispute = OPS_HOURS_PER_DISPUTE;
  const estimatedCostPerDispute = OPS_HOURS_PER_DISPUTE * LABOR_RATE_USD;
  const totalDisputeCostUsd = input.openDisputes * estimatedCostPerDispute;
  const costSavedByAutomationUsd =
    totalDisputeCostUsd * input.automatedRate * AUTOMATION_SAVINGS_FACTOR;

  return {
    openDisputes: input.openDisputes,
    avgResolutionDays: input.avgResolutionDays,
    estimatedOpsHoursPerDispute,
    estimatedCostPerDispute,
    totalDisputeCostUsd,
    automatedResolutionRate: input.automatedRate,
    costSavedByAutomationUsd,
  };
}

export function analyzePayoutEfficiency(input: {
  total: number;
  autoReleased: number;
  avgProcessingDays: number;
}): PayoutEfficiencyMetrics {
  const automationRate =
    input.total > 0 ? input.autoReleased / input.total : 0;
  const providerSatisfactionImpact = Math.max(
    0,
    1 - input.avgProcessingDays / MAX_SATISFACTION_DAYS
  );

  return {
    totalPayoutsProcessed: input.total,
    autoReleasedCount: input.autoReleased,
    manualReviewCount: input.total - input.autoReleased,
    avgProcessingDays: input.avgProcessingDays,
    providerSatisfactionImpact,
    automationRate,
  };
}
