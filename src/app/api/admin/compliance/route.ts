// GET  /api/admin/compliance — policy status, violations, alerts, audit coverage
// POST /api/admin/compliance — run_policies | remediate_violation | acknowledge_alert
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  POLICIES,
  executeAllPolicies,
  getPolicyViolations,
  getLatestResult,
} from "@/lib/compliance/policy-executor";
import {
  getViolations,
  remediateViolation,
  getRetentionComplianceScore,
} from "@/lib/compliance/retention-enforcer";
import {
  getUnacknowledgedAlerts,
  acknowledgeAlert,
  getAlertStats,
} from "@/lib/compliance/compliance-alert";
import {
  getAverageCoverage,
  getRecentChecks,
} from "@/lib/compliance/audit-checker";

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
  const severity = url.searchParams.get("severity") as "info" | "warning" | "critical" | null;

  const policiesWithLatest = POLICIES.map((p) => ({
    ...p,
    latestResult: getLatestResult(p.policyId) ?? null,
  }));

  const retentionViolations = getViolations(tenantId);
  const policyViolations = getPolicyViolations();
  const unacknowledgedAlerts = getUnacknowledgedAlerts(severity ?? undefined);
  const alertStats = getAlertStats();
  const retentionScore = getRetentionComplianceScore();
  const avgAuditCoverage = getAverageCoverage();
  const recentAuditChecks = getRecentChecks(undefined, 10);

  return NextResponse.json({
    tenantId,
    policies: policiesWithLatest,
    policyViolations,
    retentionViolations,
    alerts: unacknowledgedAlerts,
    alertStats,
    scores: {
      retentionCompliance: retentionScore,
      avgAuditCoverage: Math.round(avgAuditCoverage * 100),
    },
    recentAuditChecks,
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

  const { action, violationId, alertId } = body as Record<string, unknown>;

  if (action === "run_policies") {
    const results = executeAllPolicies();
    const passed = results.filter((r) => r.passed).length;
    return NextResponse.json({
      action: "run_policies",
      results,
      summary: { total: results.length, passed, failed: results.length - passed },
    });
  }

  if (action === "remediate_violation") {
    if (typeof violationId !== "string") {
      return NextResponse.json({ error: "violationId required" }, { status: 400 });
    }
    remediateViolation(violationId);
    return NextResponse.json({ action: "remediate_violation", violationId, success: true });
  }

  if (action === "acknowledge_alert") {
    if (typeof alertId !== "string") {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }
    acknowledgeAlert(alertId);
    return NextResponse.json({ action: "acknowledge_alert", alertId, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'run_policies', 'remediate_violation', or 'acknowledge_alert'.` },
    { status: 400 }
  );
}
