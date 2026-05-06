import { scoreResult, type ScoreResult } from "./types";

export interface TerritoryHealthInput {
  demandIndex?: number;
  providerCount?: number;
  activeCustomers?: number;
  completedJobs?: number;
  disputeRate?: number;
  slaHitRate?: number;
  revenueCents?: number;
}

export function calculateTerritoryHealthScore(input: TerritoryHealthInput): ScoreResult {
  const supplyFit = Math.min(100, ((input.providerCount ?? 0) / Math.max(1, (input.demandIndex ?? 50) / 15)) * 40);
  const demand = Math.min(input.demandIndex ?? 50, 100) * 0.25;
  const customers = Math.min(input.activeCustomers ?? 0, 500) * 0.04;
  const sla = (input.slaHitRate ?? 0.85) * 25;
  const revenue = Math.min(input.revenueCents ?? 0, 5000000) / 5000000 * 10;
  const penalty = (input.disputeRate ?? 0.02) * 100;

  return scoreResult(
    supplyFit + demand + customers + sla + revenue - penalty,
    [
      `Demand index is ${input.demandIndex ?? 50}.`,
      `${input.providerCount ?? 0} providers support ${input.activeCustomers ?? 0} active customers.`,
      `SLA hit rate is ${Math.round((input.slaHitRate ?? 0.85) * 100)}%.`,
    ],
    ["Recruit providers where demand outpaces supply.", "Prioritize SLA coaching in territories below 80% health."],
    { inverted: true }
  );
}
