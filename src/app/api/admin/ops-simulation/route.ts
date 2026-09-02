// GET  /api/admin/ops-simulation — recent scenarios, worst-case impact models, playbooks
// POST /api/admin/ops-simulation — create_scenario | run_scenario | model_impact | register_playbook | record_playbook_run
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  createScenario,
  runScenario,
  getScenario,
  getRecentScenarios,
  type ScenarioType,
} from "@/lib/ops-simulation/scenario-runner";
import {
  modelImpact,
  getImpactModel,
  getWorstCaseScenarios,
} from "@/lib/ops-simulation/impact-modeler";
import {
  getPlaybook,
  registerPlaybook,
  recordPlaybookRun,
  getAllPlaybooks,
  type Playbook,
} from "@/lib/ops-simulation/playbook-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SCENARIO_TYPES: ScenarioType[] = [
  "load_spike", "region_failure", "agent_degradation", "queue_flood",
  "tenant_churn", "payment_cascade",
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
  const scenarioId = url.searchParams.get("scenarioId");
  const scenarioType = url.searchParams.get("scenarioType") as ScenarioType | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

  const recentScenarios = getRecentScenarios(limit);
  const worstCaseScenarios = getWorstCaseScenarios(limit);
  const allPlaybooks = getAllPlaybooks();

  return NextResponse.json({
    scenarios: {
      recent: recentScenarios,
      ...(scenarioId ? { detail: getScenario(scenarioId) ?? null } : {}),
    },
    impact: {
      worstCase: worstCaseScenarios,
      ...(scenarioId ? { forScenario: getImpactModel(scenarioId) ?? null } : {}),
    },
    playbooks: {
      all: allPlaybooks,
      ...(scenarioType && VALID_SCENARIO_TYPES.includes(scenarioType)
        ? { forType: getPlaybook(scenarioType) ?? null }
        : {}),
    },
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

  if (action === "create_scenario") {
    const { scenarioType, parameters } = body as Record<string, unknown>;

    if (!VALID_SCENARIO_TYPES.includes(scenarioType as ScenarioType)) {
      return NextResponse.json(
        { error: `scenarioType must be one of: ${VALID_SCENARIO_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const scenario = createScenario(
      scenarioType as ScenarioType,
      (parameters && typeof parameters === "object") ? (parameters as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "create_scenario", scenario, success: true }, { status: 201 });
  }

  if (action === "run_scenario") {
    const { scenarioId } = body as Record<string, unknown>;
    if (typeof scenarioId !== "string") {
      return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
    }
    try {
      const scenario = runScenario(scenarioId);
      return NextResponse.json({ action: "run_scenario", scenario, success: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 });
    }
  }

  if (action === "model_impact") {
    const { scenarioId, affectedComponents, baselineCostPerMinuteUsd, mttrMs } =
      body as Record<string, unknown>;

    if (typeof scenarioId !== "string") {
      return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
    }
    if (typeof baselineCostPerMinuteUsd !== "number" || typeof mttrMs !== "number") {
      return NextResponse.json({ error: "baselineCostPerMinuteUsd and mttrMs required" }, { status: 400 });
    }

    const model = modelImpact(scenarioId, {
      affectedComponents: Array.isArray(affectedComponents) ? (affectedComponents as string[]) : [],
      baselineCostPerMinuteUsd,
      mttrMs,
    });
    return NextResponse.json({ action: "model_impact", model, success: true });
  }

  if (action === "register_playbook") {
    const { id, name, scenarioType, steps, estimatedRuntimeMs, successCriteria } =
      body as Record<string, unknown>;

    if (typeof id !== "string" || typeof name !== "string") {
      return NextResponse.json({ error: "id and name required" }, { status: 400 });
    }
    if (!VALID_SCENARIO_TYPES.includes(scenarioType as ScenarioType)) {
      return NextResponse.json(
        { error: `scenarioType must be one of: ${VALID_SCENARIO_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const playbook: Playbook = {
      id,
      name,
      scenarioType: scenarioType as ScenarioType,
      steps: Array.isArray(steps) ? (steps as string[]) : [],
      estimatedRuntimeMs: typeof estimatedRuntimeMs === "number" ? estimatedRuntimeMs : 0,
      successCriteria: typeof successCriteria === "string" ? successCriteria : "",
    };
    registerPlaybook(playbook);
    return NextResponse.json({ action: "register_playbook", playbook, success: true }, { status: 201 });
  }

  if (action === "record_playbook_run") {
    const { id, result } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!["success", "failure"].includes(result as string)) {
      return NextResponse.json({ error: "result must be 'success' or 'failure'" }, { status: 400 });
    }
    recordPlaybookRun(id, result as "success" | "failure");
    return NextResponse.json({ action: "record_playbook_run", id, result, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'create_scenario', 'run_scenario', 'model_impact', 'register_playbook', or 'record_playbook_run'.`,
    },
    { status: 400 }
  );
}
