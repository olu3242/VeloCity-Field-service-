// GET  /api/admin/security — active fraud alerts, privilege violations, recent audits, risk score
// POST /api/admin/security — trigger_alert | escalate_alert | resolve_alert | audit_privilege
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  triggerFraudAlert,
  escalateFraudAlert,
  resolveFraudAlert,
  getActiveFraudAlerts,
  getFraudRiskScore,
  type FraudTriggerType,
} from "@/lib/security/fraud-escalation";
import {
  auditPrivilege,
  getPrivilegeViolations,
  getRecentAudits,
  type PrivilegeLevel,
} from "@/lib/security/privilege-auditor";

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
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const auditLimit = Math.min(parseInt(url.searchParams.get("auditLimit") ?? "20", 10), 100);

  const activeFraudAlerts = getActiveFraudAlerts(isSuperAdmin ? undefined : tenantId);
  const fraudRiskScore = getFraudRiskScore(tenantId);
  const privilegeViolations = getPrivilegeViolations(isSuperAdmin ? undefined : tenantId);
  const recentAudits = getRecentAudits(auditLimit);

  const alertSummary = {
    total: activeFraudAlerts.length,
    byTriggerType: activeFraudAlerts.reduce<Record<string, number>>((acc, a) => {
      acc[a.triggerType] = (acc[a.triggerType] ?? 0) + 1;
      return acc;
    }, {}),
    escalated: activeFraudAlerts.filter((a) => a.escalated).length,
  };

  const violationSummary = {
    total: privilegeViolations.length,
    byAction: privilegeViolations.reduce<Record<string, number>>((acc, v) => {
      acc[v.action] = (acc[v.action] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return NextResponse.json({
    tenantId,
    fraud: {
      alerts: activeFraudAlerts,
      summary: alertSummary,
      riskScore: fraudRiskScore,
    },
    privileges: {
      violations: privilegeViolations,
      summary: violationSummary,
      recentAudits,
    },
    generatedAt: new Date().toISOString(),
  });
}

const VALID_TRIGGER_TYPES: FraudTriggerType[] = [
  "payment_pattern_anomaly",
  "dispute_storm",
  "identity_mismatch",
  "velocity_breach",
  "chargebacks_threshold",
  "blacklist_match",
];

const VALID_PRIVILEGE_LEVELS: PrivilegeLevel[] = ["public", "tenant", "admin", "system"];

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

  if (action === "trigger_alert") {
    const { triggerType, details } = body as Record<string, unknown>;

    if (!VALID_TRIGGER_TYPES.includes(triggerType as FraudTriggerType)) {
      return NextResponse.json(
        { error: `triggerType must be one of: ${VALID_TRIGGER_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const alert = await triggerFraudAlert(
      tenantId,
      triggerType as FraudTriggerType,
      (details as Record<string, unknown>) ?? {}
    );
    return NextResponse.json({ action: "trigger_alert", alert, success: true }, { status: 201 });
  }

  if (action === "escalate_alert") {
    const { alertId } = body as Record<string, unknown>;
    if (typeof alertId !== "string") {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }
    await escalateFraudAlert(alertId);
    return NextResponse.json({ action: "escalate_alert", alertId, success: true });
  }

  if (action === "resolve_alert") {
    const { alertId } = body as Record<string, unknown>;
    if (typeof alertId !== "string") {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }
    resolveFraudAlert(alertId);
    return NextResponse.json({ action: "resolve_alert", alertId, success: true });
  }

  if (action === "audit_privilege") {
    const { actor, auditAction, resource, requiredLevel, grantedLevel } = body as Record<string, unknown>;

    if (
      typeof actor !== "string" ||
      typeof auditAction !== "string" ||
      typeof resource !== "string"
    ) {
      return NextResponse.json(
        { error: "actor, auditAction, and resource required" },
        { status: 400 }
      );
    }

    const resolvedRequired: PrivilegeLevel = VALID_PRIVILEGE_LEVELS.includes(requiredLevel as PrivilegeLevel)
      ? (requiredLevel as PrivilegeLevel)
      : "tenant";

    const resolvedGranted: PrivilegeLevel = VALID_PRIVILEGE_LEVELS.includes(grantedLevel as PrivilegeLevel)
      ? (grantedLevel as PrivilegeLevel)
      : "tenant";

    const entry = auditPrivilege(actor, auditAction, resource, resolvedRequired, resolvedGranted, tenantId);
    return NextResponse.json({ action: "audit_privilege", entry, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'trigger_alert', 'escalate_alert', 'resolve_alert', or 'audit_privilege'.`,
    },
    { status: 400 }
  );
}
