// GET  /api/admin/deployment-governance — active deployments, canary analyses, lineage
// POST /api/admin/deployment-governance — register_deployment | update_status | rollback | analyze_canary | record_lineage
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerDeployment,
  updateDeploymentStatus,
  getActiveDeployments,
  getDeploymentsByEnv,
  rollbackDeployment,
  type Deployment,
} from "@/lib/deployment-governance/deployment-registry";
import {
  analyzeCanary,
  getLatestCanary,
  getFailedCanaries,
} from "@/lib/deployment-governance/canary-analyzer";
import {
  recordLineage,
  getLineage,
  getRootDeployment,
  type DeploymentLineage,
} from "@/lib/deployment-governance/lineage-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ENVIRONMENTS: Deployment["environment"][] = ["development", "staging", "production"];
const VALID_STATUSES: Deployment["status"][] = [
  "pending", "canary", "rolling", "complete", "rolled_back", "failed",
];
const VALID_CHANGE_TYPES: DeploymentLineage["changeType"][] = [
  "feature", "hotfix", "rollback", "config", "dependency",
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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const env = url.searchParams.get("env") as Deployment["environment"] | null;
  const deploymentId = url.searchParams.get("deploymentId");

  const activeDeployments = getActiveDeployments();
  const failedCanaries = getFailedCanaries();

  return NextResponse.json({
    deployments: {
      active: activeDeployments,
      ...(env && VALID_ENVIRONMENTS.includes(env)
        ? { byEnv: getDeploymentsByEnv(env) }
        : {}),
    },
    canary: {
      failed: failedCanaries,
      ...(deploymentId ? { latest: getLatestCanary(deploymentId) ?? null } : {}),
    },
    lineage: deploymentId
      ? {
          chain: getLineage(deploymentId),
          root: getRootDeployment(deploymentId) ?? null,
        }
      : undefined,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  if (action === "register_deployment") {
    const { name, version, environment, metadata } = body as Record<string, unknown>;
    if (typeof name !== "string" || typeof version !== "string") {
      return NextResponse.json({ error: "name and version required" }, { status: 400 });
    }
    if (!VALID_ENVIRONMENTS.includes(environment as Deployment["environment"])) {
      return NextResponse.json(
        { error: `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}` },
        { status: 400 }
      );
    }
    const deployment = registerDeployment(
      name,
      version,
      environment as Deployment["environment"],
      (metadata && typeof metadata === "object") ? (metadata as Record<string, unknown>) : undefined
    );
    return NextResponse.json({ action: "register_deployment", deployment, success: true }, { status: 201 });
  }

  if (action === "update_status") {
    const { id, status, healthScore } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as Deployment["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateDeploymentStatus(
      id,
      status as Deployment["status"],
      typeof healthScore === "number" ? healthScore : undefined
    );
    return NextResponse.json({ action: "update_status", id, status, success: true });
  }

  if (action === "rollback") {
    const { id, reason } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    rollbackDeployment(id, typeof reason === "string" ? reason : "admin-initiated rollback");
    return NextResponse.json({ action: "rollback", id, success: true });
  }

  if (action === "analyze_canary") {
    const { deploymentId, errorRate, latencyP99Ms, trafficPct } = body as Record<string, unknown>;
    if (typeof deploymentId !== "string") {
      return NextResponse.json({ error: "deploymentId required" }, { status: 400 });
    }
    if (typeof errorRate !== "number" || typeof latencyP99Ms !== "number" || typeof trafficPct !== "number") {
      return NextResponse.json({ error: "errorRate, latencyP99Ms, and trafficPct required" }, { status: 400 });
    }
    const analysis = analyzeCanary(deploymentId, errorRate, latencyP99Ms, trafficPct);
    return NextResponse.json({ action: "analyze_canary", analysis, success: true });
  }

  if (action === "record_lineage") {
    const { deploymentId, changeType, changedComponents, triggeredBy, parentDeploymentId } =
      body as Record<string, unknown>;

    if (typeof deploymentId !== "string" || typeof triggeredBy !== "string") {
      return NextResponse.json({ error: "deploymentId and triggeredBy required" }, { status: 400 });
    }
    if (!VALID_CHANGE_TYPES.includes(changeType as DeploymentLineage["changeType"])) {
      return NextResponse.json(
        { error: `changeType must be one of: ${VALID_CHANGE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const lineage = recordLineage(
      deploymentId,
      changeType as DeploymentLineage["changeType"],
      Array.isArray(changedComponents) ? (changedComponents as string[]) : [],
      triggeredBy,
      typeof parentDeploymentId === "string" ? parentDeploymentId : undefined
    );
    return NextResponse.json({ action: "record_lineage", lineage, success: true }, { status: 201 });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_deployment', 'update_status', 'rollback', 'analyze_canary', or 'record_lineage'.`,
    },
    { status: 400 }
  );
}
