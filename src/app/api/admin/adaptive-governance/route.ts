// GET  /api/admin/adaptive-governance — policy effectiveness, weak policies, active anomalies, recommendations
// POST /api/admin/adaptive-governance — record_policy_result | policy_effectiveness | weak_policies
//                                       | record_anomaly | detect_anomalies | resolve_anomaly
//                                       | generate_recommendation | mark_applied
// Admin-only; tenant-scoped for auth. This domain governs the platform's own enforcement
// layer and carries no tenant dimension — every record is global — so all mutating actions
// require super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordPolicyResult,
  getPolicyEffectiveness,
  getWeakPolicies,
  getEffectivenessSummary,
} from "@/lib/adaptive-governance/policy-effectiveness";
import {
  recordAnomaly,
  detectGovernanceAnomalies,
  resolveAnomaly,
  getActiveAnomalies,
  type GovernanceAnomaly,
} from "@/lib/adaptive-governance/governance-anomaly";
import {
  generateRecommendation,
  markApplied,
  getPendingRecommendations,
  getRecommendationStats,
  type EnforcementRecommendation,
} from "@/lib/adaptive-governance/enforcement-recommendations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ANOMALY_TYPES: GovernanceAnomaly["anomalyType"][] = [
  "policy_spike", "enforcement_gap", "bypass_detected", "review_backlog",
];
const VALID_SEVERITIES: GovernanceAnomaly["severity"][] = ["low", "medium", "high", "critical"];
const VALID_PRIORITIES: EnforcementRecommendation["priority"][] = ["low", "medium", "high"];

// detect_anomalies is included because it is not a pure read — it records any
// anomaly it finds into the shared store as a side effect.
const MUTATING_ACTIONS = new Set([
  "record_policy_result", "record_anomaly", "detect_anomalies",
  "resolve_anomaly", "generate_recommendation", "mark_applied",
]);

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
  const policyId = url.searchParams.get("policyId");
  const severity = url.searchParams.get("severity") as GovernanceAnomaly["severity"] | null;
  const priority = url.searchParams.get("priority") as EnforcementRecommendation["priority"] | null;
  const threshold = parseInt(url.searchParams.get("threshold") ?? "60", 10);

  return NextResponse.json({
    policies: {
      summary: getEffectivenessSummary(),
      weak: getWeakPolicies(Number.isNaN(threshold) ? 60 : threshold),
      ...(policyId ? { effectiveness: getPolicyEffectiveness(policyId) ?? null } : {}),
    },
    anomalies: {
      active: getActiveAnomalies(
        severity && VALID_SEVERITIES.includes(severity) ? severity : undefined
      ),
    },
    recommendations: {
      pending: getPendingRecommendations(
        priority && VALID_PRIORITIES.includes(priority) ? priority : undefined
      ),
      stats: getRecommendationStats(),
    },
    supported: {
      anomalyTypes: VALID_ANOMALY_TYPES,
      severities: VALID_SEVERITIES,
      priorities: VALID_PRIORITIES,
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
      { error: `Forbidden — '${action}' alters platform-wide governance records and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Policy effectiveness ────────────────────────────────────────────────

  if (action === "record_policy_result") {
    const { policyId, name, passed, wasFalsePositive, enforcementMs } = raw;
    if (typeof policyId !== "string" || policyId.trim() === "") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (typeof passed !== "boolean") {
      return NextResponse.json({ error: "passed must be a boolean" }, { status: 400 });
    }
    if (typeof wasFalsePositive !== "boolean") {
      return NextResponse.json({ error: "wasFalsePositive must be a boolean" }, { status: 400 });
    }
    if (typeof enforcementMs !== "number" || !Number.isFinite(enforcementMs) || enforcementMs < 0) {
      return NextResponse.json(
        { error: "enforcementMs must be a non-negative number" },
        { status: 400 }
      );
    }
    recordPolicyResult(policyId, name, passed, wasFalsePositive, enforcementMs);
    return NextResponse.json(
      {
        action: "record_policy_result",
        effectiveness: getPolicyEffectiveness(policyId) ?? null,
        summary: getEffectivenessSummary(),
        success: true,
      },
      { status: 201 }
    );
  }

  if (action === "policy_effectiveness") {
    const { policyId } = raw;
    if (typeof policyId !== "string") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    const effectiveness = getPolicyEffectiveness(policyId);
    if (!effectiveness) {
      return NextResponse.json(
        { error: `No recorded evaluations for policyId: ${policyId}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ action: "policy_effectiveness", effectiveness, success: true });
  }

  if (action === "weak_policies") {
    const { threshold } = raw;
    if (threshold !== undefined && (typeof threshold !== "number" || threshold < 0 || threshold > 100)) {
      return NextResponse.json({ error: "threshold must be between 0 and 100" }, { status: 400 });
    }
    return NextResponse.json({
      action: "weak_policies",
      weak: getWeakPolicies(typeof threshold === "number" ? threshold : undefined),
      summary: getEffectivenessSummary(),
      success: true,
    });
  }

  // ── Governance anomalies ────────────────────────────────────────────────

  if (action === "record_anomaly") {
    const { anomalyType, detail, severity } = raw;
    if (!VALID_ANOMALY_TYPES.includes(anomalyType as GovernanceAnomaly["anomalyType"])) {
      return NextResponse.json(
        { error: `anomalyType must be one of: ${VALID_ANOMALY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof detail !== "string" || detail.trim() === "") {
      return NextResponse.json({ error: "detail required" }, { status: 400 });
    }
    if (!VALID_SEVERITIES.includes(severity as GovernanceAnomaly["severity"])) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
        { status: 400 }
      );
    }
    const anomaly = recordAnomaly(
      anomalyType as GovernanceAnomaly["anomalyType"],
      detail,
      severity as GovernanceAnomaly["severity"]
    );
    return NextResponse.json({ action: "record_anomaly", anomaly, success: true }, { status: 201 });
  }

  if (action === "detect_anomalies") {
    const detected = detectGovernanceAnomalies();
    return NextResponse.json({
      action: "detect_anomalies",
      detected,
      // A zero count means the sweep found nothing new this run, not that the
      // platform is clean — previously recorded anomalies may still be open.
      detectedCount: detected.length,
      active: getActiveAnomalies(),
      success: true,
    });
  }

  if (action === "resolve_anomaly") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!getActiveAnomalies().some((a) => a.id === id)) {
      return NextResponse.json({ error: `No active anomaly with id: ${id}` }, { status: 404 });
    }
    resolveAnomaly(id);
    return NextResponse.json({
      action: "resolve_anomaly",
      id,
      active: getActiveAnomalies(),
      success: true,
    });
  }

  // ── Enforcement recommendations ─────────────────────────────────────────

  if (action === "generate_recommendation") {
    const { policyId, recommendation, rationale, priority } = raw;
    if (typeof policyId !== "string" || policyId.trim() === "") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (typeof recommendation !== "string" || recommendation.trim() === "") {
      return NextResponse.json({ error: "recommendation required" }, { status: 400 });
    }
    if (typeof rationale !== "string" || rationale.trim() === "") {
      return NextResponse.json({ error: "rationale required" }, { status: 400 });
    }
    if (!VALID_PRIORITIES.includes(priority as EnforcementRecommendation["priority"])) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    const rec = generateRecommendation(
      policyId,
      recommendation,
      rationale,
      priority as EnforcementRecommendation["priority"]
    );
    return NextResponse.json(
      { action: "generate_recommendation", recommendation: rec, success: true },
      { status: 201 }
    );
  }

  if (action === "mark_applied") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!getPendingRecommendations().some((r) => r.id === id)) {
      return NextResponse.json(
        { error: `No pending recommendation with id: ${id}` },
        { status: 404 }
      );
    }
    markApplied(id);
    return NextResponse.json({
      action: "mark_applied",
      id,
      stats: getRecommendationStats(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_policy_result', 'policy_effectiveness', 'weak_policies', 'record_anomaly', 'detect_anomalies', 'resolve_anomaly', 'generate_recommendation', or 'mark_applied'.`,
    },
    { status: 400 }
  );
}
