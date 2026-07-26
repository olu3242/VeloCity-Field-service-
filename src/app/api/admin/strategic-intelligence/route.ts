// GET  /api/admin/strategic-intelligence — all forecasts, high-priority risks, risk summary, maturity
// POST /api/admin/strategic-intelligence — generate_forecast | assess_risk | record_maturity
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateForecast,
  getAllForecasts,
  getLatestForecast,
} from "@/lib/strategic-intelligence/operational-forecast";
import {
  assessRisk,
  getHighPriorityRisks,
  getRiskSummary,
  type StrategicRisk,
} from "@/lib/strategic-intelligence/risk-forecaster";
import {
  scoreStrategicMaturity,
  recordMaturitySnapshot,
} from "@/lib/strategic-intelligence/maturity-scorer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_RISK_TYPES: StrategicRisk["riskType"][] = [
  "capacity", "compliance", "churn", "cost_overrun", "infrastructure",
];
const VALID_HORIZONS: StrategicRisk["horizon"][] = ["short", "medium", "long"];

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
  const metric = url.searchParams.get("metric") ?? undefined;
  const riskThreshold = parseInt(url.searchParams.get("riskThreshold") ?? "50", 10);

  const allForecasts = getAllForecasts();
  const highPriorityRisks = getHighPriorityRisks(riskThreshold);
  const riskSummary = getRiskSummary();
  const maturity = scoreStrategicMaturity();

  return NextResponse.json({
    forecasts: {
      all: allForecasts,
      ...(metric ? { latestForMetric: getLatestForecast(metric) ?? null } : {}),
    },
    risks: {
      highPriority: highPriorityRisks,
      summary: riskSummary,
    },
    maturity,
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

  if (action === "generate_forecast") {
    const { metric, currentValue, historicalValues, windowDays } =
      body as Record<string, unknown>;

    if (typeof metric !== "string") {
      return NextResponse.json({ error: "metric required" }, { status: 400 });
    }
    if (typeof currentValue !== "number") {
      return NextResponse.json({ error: "currentValue required" }, { status: 400 });
    }
    if (!Array.isArray(historicalValues)) {
      return NextResponse.json({ error: "historicalValues array required" }, { status: 400 });
    }

    const forecast = generateForecast(
      metric,
      currentValue,
      historicalValues as number[],
      typeof windowDays === "number" ? windowDays : 30
    );
    return NextResponse.json({ action: "generate_forecast", forecast, success: true });
  }

  if (action === "assess_risk") {
    const { riskType, probability, impactScore, horizon, mitigationSuggestion } =
      body as Record<string, unknown>;

    if (!VALID_RISK_TYPES.includes(riskType as StrategicRisk["riskType"])) {
      return NextResponse.json(
        { error: `riskType must be one of: ${VALID_RISK_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof probability !== "number" || typeof impactScore !== "number") {
      return NextResponse.json({ error: "probability and impactScore required" }, { status: 400 });
    }
    if (!VALID_HORIZONS.includes(horizon as StrategicRisk["horizon"])) {
      return NextResponse.json(
        { error: `horizon must be one of: ${VALID_HORIZONS.join(", ")}` },
        { status: 400 }
      );
    }

    const risk = assessRisk(
      riskType as StrategicRisk["riskType"],
      probability,
      impactScore,
      horizon as StrategicRisk["horizon"],
      typeof mitigationSuggestion === "string" ? mitigationSuggestion : ""
    );
    return NextResponse.json({ action: "assess_risk", risk, success: true });
  }

  if (action === "record_maturity") {
    const snapshot = recordMaturitySnapshot();
    return NextResponse.json({ action: "record_maturity", snapshot, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'generate_forecast', 'assess_risk', or 'record_maturity'.` },
    { status: 400 }
  );
}
