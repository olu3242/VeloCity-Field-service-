// GET  /api/admin/predictive-ops — high-probability failures, capacity plans, ops forecasts
// POST /api/admin/predictive-ops — predict_failure | acknowledge_failure | plan_capacity | forecast_metric
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  predictFailure,
  getHighProbabilityFailures,
  acknowledgeFailurePrediction,
  getPredictionAccuracy,
} from "@/lib/predictive-ops/failure-predictor";
import {
  planCapacity,
  getCapacityPlans,
  getUrgentPlans,
} from "@/lib/predictive-ops/capacity-planner";
import {
  forecastMetric,
  getLatestForecast,
  getCriticalForecasts,
} from "@/lib/predictive-ops/ops-forecaster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const metric = url.searchParams.get("metric");
  const failureThreshold = parseFloat(url.searchParams.get("failureThreshold") ?? "0.6");

  const highProbFailures = getHighProbabilityFailures(failureThreshold);
  const predictionAccuracy = getPredictionAccuracy();
  const urgentCapacityPlans = getUrgentPlans();
  const allCapacityPlans = getCapacityPlans();
  const criticalForecasts = getCriticalForecasts();

  return NextResponse.json({
    tenantId,
    failures: {
      highProbability: highProbFailures,
      accuracy: predictionAccuracy,
    },
    capacity: {
      urgent: urgentCapacityPlans,
      all: allCapacityPlans,
    },
    forecasts: {
      critical: criticalForecasts,
      ...(metric ? { latestForMetric: getLatestForecast(metric, tenantId) ?? null } : {}),
    },
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

  if (action === "predict_failure") {
    const { component, signals } = body as Record<string, unknown>;

    if (typeof component !== "string") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (!Array.isArray(signals)) {
      return NextResponse.json({ error: "signals array required" }, { status: 400 });
    }

    const prediction = predictFailure(
      component,
      signals as { type: string; weight: number }[],
      tenantId
    );
    return NextResponse.json({ action: "predict_failure", prediction, flagged: prediction !== null, success: true });
  }

  if (action === "acknowledge_failure") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    acknowledgeFailurePrediction(id);
    return NextResponse.json({ action: "acknowledge_failure", id, success: true });
  }

  if (action === "plan_capacity") {
    const { resourceType, currentCapacity, growthRatePct, costPerUnitUsd } =
      body as Record<string, unknown>;

    if (typeof resourceType !== "string") {
      return NextResponse.json({ error: "resourceType required" }, { status: 400 });
    }
    if (
      typeof currentCapacity !== "number" ||
      typeof growthRatePct !== "number" ||
      typeof costPerUnitUsd !== "number"
    ) {
      return NextResponse.json(
        { error: "currentCapacity, growthRatePct, and costPerUnitUsd required" },
        { status: 400 }
      );
    }

    const plan = planCapacity(resourceType, currentCapacity, growthRatePct, costPerUnitUsd);
    return NextResponse.json({ action: "plan_capacity", plan, success: true }, { status: 201 });
  }

  if (action === "forecast_metric") {
    const { metric, currentValue, historicalValues } = body as Record<string, unknown>;

    if (typeof metric !== "string" || typeof currentValue !== "number") {
      return NextResponse.json({ error: "metric and currentValue required" }, { status: 400 });
    }
    if (!Array.isArray(historicalValues)) {
      return NextResponse.json({ error: "historicalValues array required" }, { status: 400 });
    }

    const forecast = forecastMetric(
      metric,
      currentValue,
      historicalValues as number[],
      tenantId
    );
    return NextResponse.json({ action: "forecast_metric", forecast, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'predict_failure', 'acknowledge_failure', 'plan_capacity', or 'forecast_metric'.` },
    { status: 400 }
  );
}
