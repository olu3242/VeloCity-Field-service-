// GET /api/admin/maturity — operational readiness score, compliance validation, deployment health
// Admin-only; tenant-scoped.
//
// Read-only by design. Every function in this domain is a zero-argument evaluator that derives
// its verdict from live governance, circuit, resilience, and quota state — there is nothing to
// mutate through this surface. Writes belong to the domains being evaluated, not the evaluator.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer";
import {
  runComplianceValidation,
  getComplianceByCategory,
  COMPLIANCE_RULES,
  type ComplianceRule,
} from "@/lib/maturity/compliance-validator";
import { runDeploymentHealthCheck } from "@/lib/maturity/deployment-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: ComplianceRule["category"][] = [
  "data_isolation", "audit_trail", "sla_governance", "access_control", "operational_readiness",
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
  const category = url.searchParams.get("category") as ComplianceRule["category"] | null;

  const readiness = scoreOperationalReadiness();
  const compliance = runComplianceValidation();
  const deployment = runDeploymentHealthCheck();

  return NextResponse.json({
    readiness,
    compliance: {
      report: compliance,
      rules: COMPLIANCE_RULES,
      ...(category && VALID_CATEGORIES.includes(category)
        ? { byCategory: getComplianceByCategory(category) }
        : {}),
    },
    deployment,
    // Single verdict across all three evaluators — a deployment is only clear to
    // ship when nothing is blocked and no required compliance rule is violated.
    verdict: {
      shipReady:
        deployment.overallStatus === "ready" &&
        compliance.overallCompliant &&
        readiness.certified,
      blockers: deployment.blockers.map((b) => b.checkName),
      criticalViolations: compliance.criticalViolations.map((v) => v.ruleId),
      certificationLevel: readiness.certificationLevel,
    },
    supportedCategories: VALID_CATEGORIES,
    generatedAt: new Date().toISOString(),
  });
}
