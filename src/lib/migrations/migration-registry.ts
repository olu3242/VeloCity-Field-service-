/**
 * Migration Registry — tracks enterprise migration lifecycle in-memory.
 * Cap: 100 entries. No DB writes.
 */

import { isRuntimePaused } from "@/lib/governance/operator";

export interface Migration {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "rolled_back";
  rollbackAvailable: boolean;
  createdAt: string;
  completedAt?: string;
  appliedBy?: string;
}

const MIGRATIONS_CAP = 100;
export const MIGRATIONS: Map<string, Migration> = new Map();

export function registerMigration(
  name: string,
  version: string,
  description: string,
  rollbackAvailable = true
): Migration {
  if (MIGRATIONS.size >= MIGRATIONS_CAP) {
    const oldest = Array.from(MIGRATIONS.keys())[0];
    if (oldest) MIGRATIONS.delete(oldest);
  }
  const migration: Migration = {
    id: crypto.randomUUID(),
    name,
    version,
    description,
    status: "pending",
    rollbackAvailable,
    createdAt: new Date().toISOString(),
  };
  MIGRATIONS.set(migration.id, migration);
  return migration;
}

export function startMigration(id: string): void {
  if (isRuntimePaused()) {
    throw new Error("Cannot start migration: runtime is paused");
  }
  const m = MIGRATIONS.get(id);
  if (!m) throw new Error(`Migration not found: ${id}`);
  m.status = "running";
}

export function completeMigration(id: string, appliedBy: string): void {
  const m = MIGRATIONS.get(id);
  if (!m) throw new Error(`Migration not found: ${id}`);
  m.status = "completed";
  m.appliedBy = appliedBy;
  m.completedAt = new Date().toISOString();
}

export function failMigration(id: string, reason: string): void {
  const m = MIGRATIONS.get(id);
  if (!m) throw new Error(`Migration not found: ${id}`);
  m.status = "failed";
  m.description = `${m.description} | FAILURE: ${reason}`;
  m.completedAt = new Date().toISOString();
}

export function getMigrationsByStatus(
  status: Migration["status"]
): Migration[] {
  return Array.from(MIGRATIONS.values()).filter((m) => m.status === status);
}

export function getLatestMigrations(limit = 10): Migration[] {
  return Array.from(MIGRATIONS.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
