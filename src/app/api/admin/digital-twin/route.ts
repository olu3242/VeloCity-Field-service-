// GET  /api/admin/digital-twin — latest twin state, state history, optional live sync
// POST /api/admin/digital-twin — sync | simulate
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  syncDigitalTwin,
  getLatestTwinState,
  getTwinHistory,
  runSimulation,
  type ScenarioParams,
  type ScenarioType,
} from "@/lib/digital-twin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SCENARIO_TYPES: ScenarioType[] = [
  "territory_expansion",
  "pricing_increase",
  "provider_surge",
  "customer_churn",
  "seasonal_spike",
  "contract_loss",
  "sla_degradation",
  "revenue_growth_plan",
  "supplier_disruption",
  "workforce_expansion",
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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const historyLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "24", 10), 100);
  const liveSync = url.searchParams.get("sync") === "true";

  let current = await getLatestTwinState();

  if (liveSync || !current) {
    current = await syncDigitalTwin(tenantId);
  }

  const history = await getTwinHistory(historyLimit);

  return NextResponse.json({
    tenantId,
    current,
    history,
    scenarioTypes: VALID_SCENARIO_TYPES,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
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

  if (action === "sync") {
    const state = await syncDigitalTwin(tenantId);
    return NextResponse.json({ action: "sync", state, success: true });
  }

  if (action === "simulate") {
    const { scenarioType, magnitude, description } = body as Record<string, unknown>;

    if (!VALID_SCENARIO_TYPES.includes(scenarioType as ScenarioType)) {
      return NextResponse.json(
        { error: `scenarioType must be one of: ${VALID_SCENARIO_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof magnitude !== "number" || magnitude < 0 || magnitude > 1) {
      return NextResponse.json({ error: "magnitude must be a number between 0.0 and 1.0" }, { status: 400 });
    }

    let baseline = await getLatestTwinState();
    if (!baseline) {
      baseline = await syncDigitalTwin(tenantId);
    }

    const params: ScenarioParams = {
      type: scenarioType as ScenarioType,
      magnitude,
      description: typeof description === "string" ? description : `${scenarioType} at ${magnitude} magnitude`,
    };

    const result = runSimulation(baseline, params);
    return NextResponse.json({ action: "simulate", result, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'sync' or 'simulate'.` },
    { status: 400 }
  );
}
