/**
 * Rollback Manager — manages migration rollback plans in-memory.
 * One plan per migration, keyed by migrationId.
 */

import { isRuntimePaused } from "@/lib/governance/operator";

export interface RollbackPlan {
  id: string;
  migrationId: string;
  description: string;
  steps: string[];
  createdAt: string;
  executedAt?: string;
  status: "available" | "executed" | "unavailable";
}

export const ROLLBACK_PLANS: Map<string, RollbackPlan> = new Map();

export function createRollbackPlan(
  migrationId: string,
  description: string,
  steps: string[]
): RollbackPlan {
  const plan: RollbackPlan = {
    id: crypto.randomUUID(),
    migrationId,
    description,
    steps,
    createdAt: new Date().toISOString(),
    status: "available",
  };
  ROLLBACK_PLANS.set(migrationId, plan);
  return plan;
}

export function executeRollback(migrationId: string): RollbackPlan | null {
  if (isRuntimePaused()) return null;
  const plan = ROLLBACK_PLANS.get(migrationId);
  if (!plan || plan.status !== "available") return null;
  plan.status = "executed";
  plan.executedAt = new Date().toISOString();
  return plan;
}

export function getRollbackPlan(
  migrationId: string
): RollbackPlan | undefined {
  return ROLLBACK_PLANS.get(migrationId);
}

export function getAvailableRollbacks(): RollbackPlan[] {
  return Array.from(ROLLBACK_PLANS.values()).filter(
    (p) => p.status === "available"
  );
}
