// GET  /api/admin/resilience — composite resilience score, trend, active dependency failures, failover confidence
// POST /api/admin/resilience — record_snapshot | record_failure | resolve_failure | record_failover_test
// Admin-only; tenant-scoped. Surfaces platform-wide failure posture for governance review.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreResilience,
  recordResilienceSnapshot,
  getResilienceTrend,
  SCORE_HISTORY,
} from "@/lib/resilience/resilience-scorer";
import {
  recordFailure,
  resolveFailure,
  getActiveFailures,
  getHighCascadeRisks,
  FAILURES,
  type FailureDependency,
} from "@/lib/resilience/dependency-failure";
import {
  recordFailoverTest,
  getOverallConfidence,
  getFailedTests,
  getConfidenceSummary,
} from "@/lib/resilience/failover-confidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CASCADE_RISKS: FailureDependency["cascadeRisk"][] = ["low", "medium", "high"];

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    score: {
      current: scoreResilience(),
      trend: getResilienceTrend(),
      history: SCORE_HISTORY.slice(-limit),
    },
    failures: {
      active: getActiveFailures(),
      highCascadeRisk: getHighCascadeRisks(),
      total: FAILURES.length,
    },
    failover: {
      overallConfidence: getOverallConfidence(),
      summary: getConfidenceSummary(),
      failedTests: getFailedTests(),
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

  if (action === "record_snapshot") {
    const score = recordResilienceSnapshot();
    return NextResponse.json(
      { action: "record_snapshot", score, trend: getResilienceTrend(), success: true },
      { status: 201 }
    );
  }

  if (action === "record_failure") {
    const { failedComponent, dependentComponents, cascadeRisk } = body as Record<string, unknown>;
    if (typeof failedComponent !== "string" || failedComponent.trim() === "") {
      return NextResponse.json({ error: "failedComponent required" }, { status: 400 });
    }
    if (!Array.isArray(dependentComponents)) {
      return NextResponse.json({ error: "dependentComponents must be an array" }, { status: 400 });
    }
    if (!VALID_CASCADE_RISKS.includes(cascadeRisk as FailureDependency["cascadeRisk"])) {
      return NextResponse.json(
        { error: `cascadeRisk must be one of: ${VALID_CASCADE_RISKS.join(", ")}` },
        { status: 400 }
      );
    }
    const failure = recordFailure(
      failedComponent,
      dependentComponents as string[],
      cascadeRisk as FailureDependency["cascadeRisk"]
    );
    return NextResponse.json({ action: "record_failure", failure, success: true }, { status: 201 });
  }

  if (action === "resolve_failure") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!FAILURES.some((f) => f.id === id)) {
      return NextResponse.json({ error: `Unknown failure id: ${id}` }, { status: 404 });
    }
    resolveFailure(id);
    return NextResponse.json(
      { action: "resolve_failure", id, active: getActiveFailures().length, success: true }
    );
  }

  if (action === "record_failover_test") {
    const { scenario, confidenceScore, passed, notes } = body as Record<string, unknown>;
    if (typeof scenario !== "string" || scenario.trim() === "") {
      return NextResponse.json({ error: "scenario required" }, { status: 400 });
    }
    if (typeof confidenceScore !== "number" || !Number.isFinite(confidenceScore)) {
      return NextResponse.json({ error: "confidenceScore must be a number" }, { status: 400 });
    }
    if (typeof passed !== "boolean") {
      return NextResponse.json({ error: "passed must be a boolean" }, { status: 400 });
    }
    const test = recordFailoverTest(
      scenario,
      confidenceScore,
      passed,
      typeof notes === "string" ? notes : ""
    );
    return NextResponse.json(
      { action: "record_failover_test", test, summary: getConfidenceSummary(), success: true },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_snapshot', 'record_failure', 'resolve_failure', or 'record_failover_test'.`,
    },
    { status: 400 }
  );
}
