// GET  /api/admin/predictive — failure predictions + prediction accuracy
// POST /api/admin/predictive — submit signals for failure prediction
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
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";

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
  const threshold = parseFloat(url.searchParams.get("threshold") ?? "0.6");

  // Auto-predict from live circuit state
  const circuits = getAllCircuits();
  const openCircuits = circuits.filter((c) => c.state === "open");

  let autoPrediction = null;
  if (openCircuits.length > 0) {
    const signals = [
      { type: "circuit_trip", weight: Math.min(0.9, openCircuits.length * 0.3) },
      { type: "overload", weight: openCircuits.length / Math.max(circuits.length, 1) * 0.5 },
    ];
    autoPrediction = predictFailure("workstream-fabric", signals, tenantId);
  }

  // Platform health signals
  let healthSignals: { type: string; weight: number }[] = [];
  try {
    const health = await aggregatePlatformHealth(tenantId);
    if (health.health === "degraded") healthSignals.push({ type: "overload", weight: 0.4 });
    if (health.health === "offline") healthSignals.push({ type: "circuit_trip", weight: 0.8 });
  } catch {
    // non-fatal
  }

  if (healthSignals.length > 0) {
    predictFailure("platform-dependencies", healthSignals, tenantId);
  }

  return NextResponse.json({
    highProbabilityFailures: getHighProbabilityFailures(threshold),
    accuracy: getPredictionAccuracy(),
    autoPrediction,
    circuits: {
      total: circuits.length,
      open: openCircuits.length,
      openKeys: openCircuits.map((c) => c.key),
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

  const { component, signals, acknowledge } = body as Record<string, unknown>;

  // Acknowledge a prediction
  if (typeof acknowledge === "string") {
    acknowledgeFailurePrediction(acknowledge);
    return NextResponse.json({ acknowledged: acknowledge });
  }

  // Submit signals for prediction
  if (typeof component !== "string" || !Array.isArray(signals)) {
    return NextResponse.json(
      { error: "component (string) and signals (array of {type, weight}) required" },
      { status: 400 }
    );
  }

  const typedSignals = signals.map((s: unknown) => ({
    type: (s as Record<string, unknown>).type as string,
    weight: Number((s as Record<string, unknown>).weight),
  }));

  const prediction = predictFailure(component, typedSignals, tenantId);
  return NextResponse.json({ prediction });
}
