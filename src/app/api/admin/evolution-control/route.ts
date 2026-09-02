// GET  /api/admin/evolution-control — migrations, rollout configs, compatibility report
// POST /api/admin/evolution-control — create_migration | approve_migration | execute_migration | complete_migration | rollback_migration | register_feature | update_rollout | activate_feature
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createMigrationPlan,
  approveMigration,
  executeMigration,
  completeMigration,
  rollbackMigration,
  getMigrations,
  type MigrationPlan,
} from "@/lib/evolution-control/migration-safeguards";
import {
  registerFeature,
  isFeatureEnabled,
  updateRolloutPct,
  activateFeature,
  type RolloutConfig,
} from "@/lib/evolution-control/rollout-controller";
import {
  runCompatibilityChecks,
} from "@/lib/evolution-control/compatibility-checker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_RISK_LEVELS: MigrationPlan["riskLevel"][] = ["low", "medium", "high"];
const VALID_MIGRATION_STATUSES: MigrationPlan["status"][] = [
  "draft", "approved", "executing", "completed", "rolled_back",
];
const VALID_CERT_LEVELS: RolloutConfig["minCertificationLevel"][] = [
  "standard", "premium", "enterprise",
];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const migrationStatus = url.searchParams.get("migrationStatus") as MigrationPlan["status"] | null;
  const featureId = url.searchParams.get("featureId");
  const tenantIndex = parseInt(url.searchParams.get("tenantIndex") ?? "0", 10);
  const totalTenants = parseInt(url.searchParams.get("totalTenants") ?? "1", 10);
  const runChecks = url.searchParams.get("runChecks") === "true";

  const migrations = getMigrations(
    migrationStatus && VALID_MIGRATION_STATUSES.includes(migrationStatus)
      ? migrationStatus
      : undefined
  );

  return NextResponse.json({
    migrations,
    ...(featureId
      ? { featureEnabled: isFeatureEnabled(featureId, tenantIndex, totalTenants) }
      : {}),
    ...(runChecks ? { compatibility: await runCompatibilityChecks() } : {}),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "create_migration") {
    const { name, description, affectedWorkflows, riskLevel, rollbackAvailable } =
      body as Record<string, unknown>;

    if (typeof name !== "string" || typeof description !== "string") {
      return NextResponse.json({ error: "name and description required" }, { status: 400 });
    }
    if (!VALID_RISK_LEVELS.includes(riskLevel as MigrationPlan["riskLevel"])) {
      return NextResponse.json(
        { error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }

    const plan = createMigrationPlan({
      name,
      description,
      affectedWorkflows: Array.isArray(affectedWorkflows) ? (affectedWorkflows as string[]) : [],
      riskLevel: riskLevel as MigrationPlan["riskLevel"],
      rollbackAvailable: rollbackAvailable === true,
    });
    return NextResponse.json({ action: "create_migration", plan, success: true }, { status: 201 });
  }

  if (action === "approve_migration") {
    const { id, approvedBy } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof approvedBy !== "string") {
      return NextResponse.json({ error: "id and approvedBy required" }, { status: 400 });
    }
    approveMigration(id, approvedBy);
    return NextResponse.json({ action: "approve_migration", id, success: true });
  }

  if (action === "execute_migration") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    executeMigration(id);
    return NextResponse.json({ action: "execute_migration", id, success: true });
  }

  if (action === "complete_migration") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    completeMigration(id);
    return NextResponse.json({ action: "complete_migration", id, success: true });
  }

  if (action === "rollback_migration") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    rollbackMigration(id);
    return NextResponse.json({ action: "rollback_migration", id, success: true });
  }

  if (action === "register_feature") {
    const { featureId, name, tenantRolloutPct, requiresCertification, minCertificationLevel, enabled } =
      body as Record<string, unknown>;

    if (typeof featureId !== "string" || typeof name !== "string") {
      return NextResponse.json({ error: "featureId and name required" }, { status: 400 });
    }
    if (!VALID_CERT_LEVELS.includes(minCertificationLevel as RolloutConfig["minCertificationLevel"])) {
      return NextResponse.json(
        { error: `minCertificationLevel must be one of: ${VALID_CERT_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }

    registerFeature({
      featureId,
      name,
      tenantRolloutPct: typeof tenantRolloutPct === "number" ? tenantRolloutPct : 0,
      requiresCertification: requiresCertification === true,
      minCertificationLevel: (minCertificationLevel as RolloutConfig["minCertificationLevel"]) ?? "standard",
      enabled: enabled !== false,
    });
    return NextResponse.json({ action: "register_feature", featureId, success: true }, { status: 201 });
  }

  if (action === "update_rollout") {
    const { featureId, pct } = body as Record<string, unknown>;
    if (typeof featureId !== "string" || typeof pct !== "number") {
      return NextResponse.json({ error: "featureId and pct required" }, { status: 400 });
    }
    updateRolloutPct(featureId, pct);
    return NextResponse.json({ action: "update_rollout", featureId, pct, success: true });
  }

  if (action === "activate_feature") {
    const { featureId } = body as Record<string, unknown>;
    if (typeof featureId !== "string") {
      return NextResponse.json({ error: "featureId required" }, { status: 400 });
    }
    activateFeature(featureId);
    return NextResponse.json({ action: "activate_feature", featureId, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'create_migration', 'approve_migration', 'execute_migration', 'complete_migration', 'rollback_migration', 'register_feature', 'update_rollout', or 'activate_feature'.`,
    },
    { status: 400 }
  );
}
