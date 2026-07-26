// GET  /api/admin/autonomous-governance — active drifts, drift summary, governance health, policy analytics
// POST /api/admin/autonomous-governance — record_snapshot | record_policy_evaluation | resolve_drift
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  detectDrift,
  getActiveDrifts,
  getDriftSummary,
  resolveDrift,
} from "@/lib/autonomous-governance/drift-detector";
import {
  scoreGovernanceHealth,
  recordHealthSnapshot,
  getHealthTrend,
} from "@/lib/autonomous-governance/governance-health";
import {
  getPolicyAnalyticsSummary,
  getUnderperformingPolicies,
  recordPolicyEvaluation,
} from "@/lib/autonomous-governance/policy-analytics";

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

  const url = new URL(request.url);
  const passRateThreshold = parseFloat(url.searchParams.get("passRateThreshold") ?? "0.8");

  const detectedDrifts = detectDrift();
  const activeDrifts = getActiveDrifts();
  const driftSummary = getDriftSummary();
  const healthReport = scoreGovernanceHealth();
  const healthTrend = getHealthTrend();
  const policyAnalytics = getPolicyAnalyticsSummary();
  const underperformingPolicies = getUnderperformingPolicies(passRateThreshold);

  return NextResponse.json({
    drift: {
      detected: detectedDrifts,
      active: activeDrifts,
      summary: driftSummary,
    },
    health: {
      report: healthReport,
      trend: healthTrend,
    },
    policies: {
      analytics: policyAnalytics,
      underperforming: underperformingPolicies,
    },
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

  if (action === "record_snapshot") {
    const snapshot = recordHealthSnapshot();
    return NextResponse.json({ action: "record_snapshot", snapshot, success: true });
  }

  if (action === "record_policy_evaluation") {
    const { policyId, passed, responseMs } = body as Record<string, unknown>;

    if (typeof policyId !== "string") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (typeof passed !== "boolean") {
      return NextResponse.json({ error: "passed (boolean) required" }, { status: 400 });
    }

    recordPolicyEvaluation(
      policyId,
      passed,
      typeof responseMs === "number" ? responseMs : 0
    );
    return NextResponse.json({ action: "record_policy_evaluation", policyId, passed, success: true });
  }

  if (action === "resolve_drift") {
    const { driftId } = body as Record<string, unknown>;

    if (typeof driftId !== "string") {
      return NextResponse.json({ error: "driftId required" }, { status: 400 });
    }

    resolveDrift(driftId);
    return NextResponse.json({ action: "resolve_drift", driftId, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_snapshot', 'record_policy_evaluation', or 'resolve_drift'.` },
    { status: 400 }
  );
}
