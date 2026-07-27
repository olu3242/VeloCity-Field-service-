// GET  /api/admin/runtime-resilience — active recoveries, recovery stats, policies, survivability
// POST /api/admin/runtime-resilience — initiate_recovery | complete_recovery | fail_recovery
//                                      | register_policy | evaluate_policies | trigger_policy
//                                      | compute_survivability | record_snapshot
// Admin-only. Recovery actions carry a tenantId and are guarded to the caller's tenant.
// Resilience policies govern platform-wide auto-remediation, so mutating them requires super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  initiateRecovery,
  completeRecovery,
  failRecovery,
  getActiveRecoveries,
  getRecoveryStats,
  type RecoveryAction,
} from "@/lib/runtime-resilience/recovery-orchestrator";
import {
  registerPolicy,
  evaluatePolicies,
  triggerPolicy,
  getActivePolicies,
  type ResiliencePolicy,
} from "@/lib/runtime-resilience/resilience-policy";
import {
  computeSurvivability,
  recordSurvivabilitySnapshot,
  getSurvivabilityTrend,
} from "@/lib/runtime-resilience/survivability-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ACTION_TYPES: RecoveryAction["actionType"][] = [
  "restart", "failover", "circuit_trip", "queue_drain", "scale_up",
];
const VALID_CONDITIONS: ResiliencePolicy["triggerCondition"][] = [
  "heartbeat_stale", "error_rate_high", "circuit_open", "queue_depth_critical",
];
const VALID_REMEDIATIONS: ResiliencePolicy["remediationAction"][] = [
  "restart", "failover", "alert_only", "scale_up",
];

const POLICY_MUTATIONS = new Set(["register_policy", "trigger_policy"]);

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
  void request;

  return NextResponse.json({
    recovery: {
      // Recovery actions may be tenant-scoped or platform-level (no tenantId);
      // this tenant sees its own plus the platform-level ones.
      active: getActiveRecoveries().filter(
        (a) => a.tenantId === undefined || a.tenantId === tenantId
      ),
      stats: getRecoveryStats(),
    },
    policies: {
      all: getActivePolicies(),
    },
    survivability: {
      current: computeSurvivability(),
      trend: getSurvivabilityTrend(),
    },
    supported: {
      actionTypes: VALID_ACTION_TYPES,
      triggerConditions: VALID_CONDITIONS,
      remediationActions: VALID_REMEDIATIONS,
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

  if (typeof action === "string" && POLICY_MUTATIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' governs platform-wide auto-remediation and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Recovery orchestration ──────────────────────────────────────────────

  if (action === "initiate_recovery") {
    const { component, actionType, trigger } = raw;
    if (typeof component !== "string" || component.trim() === "") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (!VALID_ACTION_TYPES.includes(actionType as RecoveryAction["actionType"])) {
      return NextResponse.json(
        { error: `actionType must be one of: ${VALID_ACTION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof trigger !== "string" || trigger.trim() === "") {
      return NextResponse.json({ error: "trigger required for audit trail" }, { status: 400 });
    }
    const recovery = initiateRecovery(
      component,
      actionType as RecoveryAction["actionType"],
      trigger,
      tenantId
    );
    // A paused runtime returns a pre-failed action rather than throwing — surface
    // that as 409 so a blocked recovery is never reported as started.
    const blocked = recovery.status === "failed";
    return NextResponse.json(
      { action: "initiate_recovery", recovery, success: !blocked },
      { status: blocked ? 409 : 201 }
    );
  }

  if (action === "complete_recovery" || action === "fail_recovery") {
    const { id, outcome, reason } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // complete/fail silently no-op on an unknown id — verify ownership against
    // this tenant's in-flight recoveries first.
    const owned = getActiveRecoveries().find(
      (a) => a.id === id && (a.tenantId === undefined || a.tenantId === tenantId)
    );
    if (!owned) {
      return NextResponse.json(
        { error: "In-flight recovery not found for this tenant" },
        { status: 404 }
      );
    }

    if (action === "complete_recovery") {
      if (typeof outcome !== "string" || outcome.trim() === "") {
        return NextResponse.json({ error: "outcome required" }, { status: 400 });
      }
      completeRecovery(id, outcome);
    } else {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required" }, { status: 400 });
      }
      failRecovery(id, reason);
    }

    return NextResponse.json({ action, id, stats: getRecoveryStats(), success: true });
  }

  // ── Resilience policies ─────────────────────────────────────────────────

  if (action === "register_policy") {
    const { policyId, name, component, triggerCondition, autoRemediate, remediationAction, cooldownMs } = raw;
    if (typeof policyId !== "string" || policyId.trim() === "") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (typeof name !== "string" || typeof component !== "string") {
      return NextResponse.json({ error: "name and component required" }, { status: 400 });
    }
    if (!VALID_CONDITIONS.includes(triggerCondition as ResiliencePolicy["triggerCondition"])) {
      return NextResponse.json(
        { error: `triggerCondition must be one of: ${VALID_CONDITIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_REMEDIATIONS.includes(remediationAction as ResiliencePolicy["remediationAction"])) {
      return NextResponse.json(
        { error: `remediationAction must be one of: ${VALID_REMEDIATIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (cooldownMs !== undefined && (typeof cooldownMs !== "number" || cooldownMs < 0)) {
      return NextResponse.json({ error: "cooldownMs must be non-negative" }, { status: 400 });
    }
    const policy: ResiliencePolicy = {
      policyId,
      name,
      component,
      triggerCondition: triggerCondition as ResiliencePolicy["triggerCondition"],
      autoRemediate: autoRemediate === true,
      remediationAction: remediationAction as ResiliencePolicy["remediationAction"],
      cooldownMs: typeof cooldownMs === "number" ? cooldownMs : 60_000,
    };
    registerPolicy(policy);
    return NextResponse.json({ action: "register_policy", policy, success: true }, { status: 201 });
  }

  if (action === "evaluate_policies") {
    const { component, condition } = raw;
    if (typeof component !== "string" || component.trim() === "") {
      return NextResponse.json({ error: "component required" }, { status: 400 });
    }
    if (!VALID_CONDITIONS.includes(condition as ResiliencePolicy["triggerCondition"])) {
      return NextResponse.json(
        { error: `condition must be one of: ${VALID_CONDITIONS.join(", ")}` },
        { status: 400 }
      );
    }
    const matched = evaluatePolicies(
      component,
      condition as ResiliencePolicy["triggerCondition"]
    );
    return NextResponse.json({
      action: "evaluate_policies",
      matched,
      // Policies still inside their cooldown window are filtered out by the lib —
      // report the count so an empty result is not mistaken for "no policy exists".
      totalPolicies: getActivePolicies().length,
      success: true,
    });
  }

  if (action === "trigger_policy") {
    const { policyId } = raw;
    if (typeof policyId !== "string") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    const policy = triggerPolicy(policyId);
    if (!policy) {
      return NextResponse.json({ error: `Unknown policyId: ${policyId}` }, { status: 404 });
    }
    return NextResponse.json({ action: "trigger_policy", policy, success: true });
  }

  // ── Survivability ───────────────────────────────────────────────────────

  if (action === "compute_survivability") {
    return NextResponse.json({
      action: "compute_survivability",
      report: computeSurvivability(),
      trend: getSurvivabilityTrend(),
      success: true,
    });
  }

  if (action === "record_snapshot") {
    const report = recordSurvivabilitySnapshot();
    return NextResponse.json(
      { action: "record_snapshot", report, trend: getSurvivabilityTrend(), success: true },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'initiate_recovery', 'complete_recovery', 'fail_recovery', 'register_policy', 'evaluate_policies', 'trigger_policy', 'compute_survivability', or 'record_snapshot'.`,
    },
    { status: 400 }
  );
}
