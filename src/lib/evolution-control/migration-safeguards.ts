/**
 * Workflow migration safeguards.
 * Tracks migration plans through their lifecycle with runtime-aware risk escalation.
 */

import { randomUUID } from "crypto";
import { isRuntimePaused } from "@/lib/governance/operator";

export interface MigrationPlan {
  id: string;
  name: string;
  description: string;
  affectedWorkflows: string[];
  riskLevel: "low" | "medium" | "high";
  rollbackAvailable: boolean;
  approvedBy?: string;
  status: "draft" | "approved" | "executing" | "completed" | "rolled_back";
  createdAt: string;
}

const CAP = 50;
export const MIGRATIONS: Map<string, MigrationPlan> = new Map<string, MigrationPlan>();

export function createMigrationPlan(
  plan: Omit<MigrationPlan, "id" | "status" | "createdAt">
): MigrationPlan {
  const riskLevel: MigrationPlan["riskLevel"] =
    isRuntimePaused() ? "high" : plan.riskLevel;

  const migration: MigrationPlan = {
    ...plan,
    id: randomUUID(),
    riskLevel,
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  if (MIGRATIONS.size >= CAP) {
    // Remove oldest entry
    const firstKey = Array.from(MIGRATIONS.keys())[0];
    if (firstKey !== undefined) {
      MIGRATIONS.delete(firstKey);
    }
  }

  MIGRATIONS.set(migration.id, migration);
  return migration;
}

export function approveMigration(id: string, approvedBy: string): void {
  const plan = MIGRATIONS.get(id);
  if (plan && plan.status === "draft") {
    plan.status = "approved";
    plan.approvedBy = approvedBy;
  }
}

export function executeMigration(id: string): void {
  const plan = MIGRATIONS.get(id);
  if (plan && plan.status === "approved") {
    plan.status = "executing";
  }
}

export function completeMigration(id: string): void {
  const plan = MIGRATIONS.get(id);
  if (plan) {
    plan.status = "completed";
  }
}

export function rollbackMigration(id: string): void {
  const plan = MIGRATIONS.get(id);
  if (plan && plan.rollbackAvailable) {
    plan.status = "rolled_back";
  }
}

export function getMigrations(status?: MigrationPlan["status"]): MigrationPlan[] {
  const all = Array.from(MIGRATIONS.values());
  if (status === undefined) return all;
  return all.filter((m) => m.status === status);
}
