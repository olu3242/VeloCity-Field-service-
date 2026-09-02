// GET  /api/admin/migrations — migration registry, rollback plans, schema guard report
// POST /api/admin/migrations — register_migration | start_migration | complete_migration
//                              | fail_migration | create_rollback_plan | execute_rollback
//                              | run_schema_guard
// Admin-only; tenant-scoped for auth. Migrations alter platform schema for every tenant and
// carry no tenant dimension, so all mutating actions require super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { isRuntimePaused } from "@/lib/governance/operator";
import {
  MIGRATIONS,
  registerMigration,
  startMigration,
  completeMigration,
  failMigration,
  getMigrationsByStatus,
  getLatestMigrations,
  type Migration,
} from "@/lib/migrations/migration-registry";
import {
  createRollbackPlan,
  executeRollback,
  getRollbackPlan,
  getAvailableRollbacks,
} from "@/lib/migrations/rollback-manager";
import { runSchemaGuard } from "@/lib/migrations/schema-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES: Migration["status"][] = [
  "pending", "running", "completed", "failed", "rolled_back",
];

const MUTATING_ACTIONS = new Set([
  "register_migration", "start_migration", "complete_migration",
  "fail_migration", "create_rollback_plan", "execute_rollback",
]);

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const migrationId = url.searchParams.get("migrationId");
  const status = url.searchParams.get("status") as Migration["status"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  return NextResponse.json({
    migrations: {
      latest: getLatestMigrations(limit),
      ...(status && VALID_STATUSES.includes(status)
        ? { byStatus: getMigrationsByStatus(status) }
        : {}),
      ...(migrationId ? { migration: MIGRATIONS.get(migrationId) ?? null } : {}),
    },
    rollbacks: {
      available: getAvailableRollbacks(),
      ...(migrationId ? { plan: getRollbackPlan(migrationId) ?? null } : {}),
    },
    schemaGuard: runSchemaGuard(),
    runtimePaused: isRuntimePaused(),
    supportedStatuses: VALID_STATUSES,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (typeof action === "string" && MUTATING_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters platform schema state and requires super_admin` },
      { status: 403 }
    );
  }

  if (action === "register_migration") {
    const { name, version, description, rollbackAvailable } = raw;
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (typeof version !== "string" || version.trim() === "") {
      return NextResponse.json({ error: "version required" }, { status: 400 });
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    const migration = registerMigration(
      name,
      version,
      description,
      rollbackAvailable !== false
    );
    return NextResponse.json({ action: "register_migration", migration, success: true }, { status: 201 });
  }

  if (action === "start_migration") {
    const { id, overrideGuard } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const migration = MIGRATIONS.get(id);
    if (!migration) {
      return NextResponse.json({ error: `Unknown migration id: ${id}` }, { status: 404 });
    }
    if (migration.status !== "pending") {
      return NextResponse.json(
        { error: `Migration is '${migration.status}' — only pending migrations can be started` },
        { status: 409 }
      );
    }

    // Refuse to start when the schema guard reports critical failures. The
    // registry itself does not consult the guard, so this gate lives here.
    // An explicit overrideGuard:true is required to proceed anyway, and the
    // failing checks are echoed back so the decision is recorded knowingly.
    const guard = runSchemaGuard();
    if (!guard.safeToMigrate && overrideGuard !== true) {
      return NextResponse.json(
        {
          error: "Schema guard reports critical failures — migration blocked",
          criticalFailures: guard.criticalFailures,
          hint: "Resolve the failures, or resend with overrideGuard: true to proceed deliberately.",
        },
        { status: 409 }
      );
    }

    try {
      startMigration(id);
    } catch (err) {
      // startMigration throws when the runtime is paused.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to start migration" },
        { status: 409 }
      );
    }
    return NextResponse.json({
      action: "start_migration",
      migration: MIGRATIONS.get(id) ?? null,
      guardOverridden: !guard.safeToMigrate,
      success: true,
    });
  }

  if (action === "complete_migration" || action === "fail_migration") {
    const { id, reason } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const migration = MIGRATIONS.get(id);
    if (!migration) {
      return NextResponse.json({ error: `Unknown migration id: ${id}` }, { status: 404 });
    }
    if (migration.status !== "running") {
      return NextResponse.json(
        { error: `Migration is '${migration.status}' — only running migrations can be resolved` },
        { status: 409 }
      );
    }

    if (action === "complete_migration") {
      // appliedBy comes from the session, never the body — the record of who
      // applied a schema change must not be forgeable.
      completeMigration(id, auth.userId);
    } else {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required to fail a migration" }, { status: 400 });
      }
      failMigration(id, reason);
    }

    return NextResponse.json({
      action,
      migration: MIGRATIONS.get(id) ?? null,
      success: true,
    });
  }

  if (action === "create_rollback_plan") {
    const { migrationId, description, steps } = raw;
    if (typeof migrationId !== "string") {
      return NextResponse.json({ error: "migrationId required" }, { status: 400 });
    }
    if (!MIGRATIONS.has(migrationId)) {
      return NextResponse.json({ error: `Unknown migration id: ${migrationId}` }, { status: 404 });
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "steps must be a non-empty array" }, { status: 400 });
    }
    if (!steps.every((s) => typeof s === "string")) {
      return NextResponse.json({ error: "steps must contain only strings" }, { status: 400 });
    }
    const plan = createRollbackPlan(migrationId, description, steps as string[]);
    return NextResponse.json({ action: "create_rollback_plan", plan, success: true }, { status: 201 });
  }

  if (action === "execute_rollback") {
    const { migrationId } = raw;
    if (typeof migrationId !== "string") {
      return NextResponse.json({ error: "migrationId required" }, { status: 400 });
    }
    const existing = getRollbackPlan(migrationId);
    if (!existing) {
      return NextResponse.json(
        { error: `No rollback plan for migration: ${migrationId}` },
        { status: 404 }
      );
    }
    if (existing.status !== "available") {
      return NextResponse.json(
        { error: `Rollback plan is '${existing.status}' — only available plans can be executed` },
        { status: 409 }
      );
    }
    const plan = executeRollback(migrationId);
    if (!plan) {
      // executeRollback returns null when the runtime is paused — a null here is
      // a refusal, never a silent success.
      return NextResponse.json(
        { error: "Rollback refused — runtime is paused", runtimePaused: isRuntimePaused() },
        { status: 409 }
      );
    }
    return NextResponse.json({ action: "execute_rollback", plan, success: true });
  }

  if (action === "run_schema_guard") {
    return NextResponse.json({
      action: "run_schema_guard",
      report: runSchemaGuard(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_migration', 'start_migration', 'complete_migration', 'fail_migration', 'create_rollback_plan', 'execute_rollback', or 'run_schema_guard'.`,
    },
    { status: 400 }
  );
}
