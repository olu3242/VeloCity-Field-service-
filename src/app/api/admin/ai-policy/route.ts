// GET  /api/admin/ai-policy — rules by agent, pending approvals, restricted actions, violation summary
// POST /api/admin/ai-policy — register_rule | evaluate_rules | effective_action | request_approval
//                             | resolve_approval | expire_stale_approvals | register_restricted_action
//                             | check_action_allowed | record_execution | record_violation | resolve_violation
// Admin-only; tenant-scoped. AI guardrail layer — execution rules, human approval gates, and violation audit.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerRule,
  evaluateRules,
  getEffectiveAction,
  getRulesByAgent,
  type AIExecutionRule,
  type RuleAction,
} from "@/lib/ai-policy/execution-rules";
import {
  requestApproval,
  resolveApproval,
  expireStaleApprovals,
  getPendingApprovals,
} from "@/lib/ai-policy/approval-policies";
import {
  registerRestrictedAction,
  checkActionAllowed,
  recordExecution,
  getAllRestrictedActions,
  type RestrictedAction,
} from "@/lib/ai-policy/restricted-actions";
import {
  recordViolation,
  resolveViolation,
  getViolationsByAgent,
  getViolationsByTenant,
  getViolationSummary,
  type PolicyViolation,
} from "@/lib/ai-policy/violation-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_RULE_ACTIONS: RuleAction[] = ["allow", "deny", "require_approval", "log_only"];
const VALID_APPROVAL_STATUSES = ["approved", "denied"] as const;
const VALID_VIOLATION_TYPES: PolicyViolation["violationType"][] = [
  "denied", "approval_bypassed", "rate_exceeded", "restricted_action",
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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const agentName = url.searchParams.get("agentName");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    rules: {
      ...(agentName ? { byAgent: getRulesByAgent(agentName) } : {}),
      supportedActions: VALID_RULE_ACTIONS,
    },
    approvals: {
      pending: getPendingApprovals(agentName ?? undefined),
    },
    restrictedActions: getAllRestrictedActions(),
    violations: {
      summary: getViolationSummary(),
      byTenant: getViolationsByTenant(tenantId, limit),
      ...(agentName ? { byAgent: getViolationsByAgent(agentName, limit) } : {}),
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

  if (action === "register_rule") {
    const { ruleId, name, agentName, eventType, condition, action: ruleAction, priority, enabled } =
      body as Record<string, unknown>;
    if (typeof ruleId !== "string" || typeof name !== "string" || typeof condition !== "string") {
      return NextResponse.json({ error: "ruleId, name, and condition required" }, { status: 400 });
    }
    if (!VALID_RULE_ACTIONS.includes(ruleAction as RuleAction)) {
      return NextResponse.json(
        { error: `action must be one of: ${VALID_RULE_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    const rule: AIExecutionRule = {
      ruleId,
      name,
      condition,
      action: ruleAction as RuleAction,
      priority: typeof priority === "number" ? priority : 50,
      enabled: typeof enabled === "boolean" ? enabled : true,
      ...(typeof agentName === "string" ? { agentName } : {}),
      ...(typeof eventType === "string" ? { eventType } : {}),
    };
    registerRule(rule);
    return NextResponse.json({ action: "register_rule", rule, success: true }, { status: 201 });
  }

  if (action === "evaluate_rules" || action === "effective_action") {
    const { agentName, eventType, context } = body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ error: "agentName and eventType required" }, { status: 400 });
    }
    const ctx = context && typeof context === "object" ? (context as Record<string, unknown>) : {};

    if (action === "effective_action") {
      const effective = await getEffectiveAction(agentName, eventType, ctx);
      return NextResponse.json({ action: "effective_action", effective, success: true });
    }
    const evaluations = await evaluateRules(agentName, eventType, ctx);
    return NextResponse.json({ action: "evaluate_rules", evaluations, success: true });
  }

  if (action === "request_approval") {
    const { policyId, agentName, eventType, context } = body as Record<string, unknown>;
    if (typeof policyId !== "string" || typeof agentName !== "string" || typeof eventType !== "string") {
      return NextResponse.json(
        { error: "policyId, agentName, and eventType required" },
        { status: 400 }
      );
    }
    try {
      const approval = requestApproval(
        policyId,
        agentName,
        eventType,
        context && typeof context === "object" ? (context as Record<string, unknown>) : {},
        tenantId
      );
      return NextResponse.json({ action: "request_approval", approval, success: true }, { status: 201 });
    } catch (err) {
      // requestApproval throws on an unknown policyId — surface as 404, not 500.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Approval request failed" },
        { status: 404 }
      );
    }
  }

  if (action === "resolve_approval") {
    const { id, status, resolvedBy } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_APPROVAL_STATUSES.includes(status as (typeof VALID_APPROVAL_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_APPROVAL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof resolvedBy !== "string" || resolvedBy.trim() === "") {
      return NextResponse.json({ error: "resolvedBy required for audit trail" }, { status: 400 });
    }
    // Only a still-pending approval owned by this tenant may be resolved.
    const owned = getPendingApprovals().find((a) => a.id === id && a.tenantId === tenantId);
    if (!owned) {
      return NextResponse.json(
        { error: "Pending approval not found for this tenant" },
        { status: 404 }
      );
    }
    resolveApproval(id, status as (typeof VALID_APPROVAL_STATUSES)[number], resolvedBy);
    return NextResponse.json({ action: "resolve_approval", id, status, resolvedBy, success: true });
  }

  if (action === "expire_stale_approvals") {
    const expired = expireStaleApprovals();
    return NextResponse.json({
      action: "expire_stale_approvals",
      expired,
      pending: getPendingApprovals().length,
      success: true,
    });
  }

  if (action === "register_restricted_action") {
    const { actionId, description, agentName, maxValueUsd, requiresHumanApproval, cooldownMs } =
      body as Record<string, unknown>;
    if (typeof actionId !== "string" || typeof description !== "string" || typeof agentName !== "string") {
      return NextResponse.json(
        { error: "actionId, description, and agentName required" },
        { status: 400 }
      );
    }
    const restricted: RestrictedAction = {
      actionId,
      description,
      agentName,
      requiresHumanApproval:
        typeof requiresHumanApproval === "boolean" ? requiresHumanApproval : true,
      ...(typeof maxValueUsd === "number" ? { maxValueUsd } : {}),
      ...(typeof cooldownMs === "number" ? { cooldownMs } : {}),
    };
    registerRestrictedAction(restricted);
    return NextResponse.json(
      { action: "register_restricted_action", restrictedAction: restricted, success: true },
      { status: 201 }
    );
  }

  if (action === "check_action_allowed") {
    const { actionId, valueUsd, requestedBy } = body as Record<string, unknown>;
    if (typeof actionId !== "string") {
      return NextResponse.json({ error: "actionId required" }, { status: 400 });
    }
    const verdict = checkActionAllowed(actionId, {
      ...(typeof valueUsd === "number" ? { valueUsd } : {}),
      ...(typeof requestedBy === "string" ? { requestedBy } : {}),
    });
    return NextResponse.json({ action: "check_action_allowed", verdict, success: true });
  }

  if (action === "record_execution") {
    const { actionId } = body as Record<string, unknown>;
    if (typeof actionId !== "string") {
      return NextResponse.json({ error: "actionId required" }, { status: 400 });
    }
    if (!getAllRestrictedActions().some((a) => a.actionId === actionId)) {
      return NextResponse.json({ error: `Unknown actionId: ${actionId}` }, { status: 404 });
    }
    recordExecution(actionId);
    return NextResponse.json({ action: "record_execution", actionId, success: true });
  }

  if (action === "record_violation") {
    const { ruleId, ruleName, agentName, eventType, violationType, detail } =
      body as Record<string, unknown>;
    if (typeof ruleId !== "string" || typeof ruleName !== "string") {
      return NextResponse.json({ error: "ruleId and ruleName required" }, { status: 400 });
    }
    if (typeof agentName !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ error: "agentName and eventType required" }, { status: 400 });
    }
    if (!VALID_VIOLATION_TYPES.includes(violationType as PolicyViolation["violationType"])) {
      return NextResponse.json(
        { error: `violationType must be one of: ${VALID_VIOLATION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof detail !== "string" || detail.trim() === "") {
      return NextResponse.json({ error: "detail required" }, { status: 400 });
    }
    const violation = recordViolation({
      ruleId,
      ruleName,
      agentName,
      eventType,
      tenantId,
      violationType: violationType as PolicyViolation["violationType"],
      detail,
    });
    return NextResponse.json({ action: "record_violation", violation, success: true }, { status: 201 });
  }

  if (action === "resolve_violation") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Tenant guard — a violation may only be resolved by an admin of its owning tenant.
    if (!getViolationsByTenant(tenantId, 500).some((v) => v.id === id && !v.resolved)) {
      return NextResponse.json(
        { error: "Unresolved violation not found for this tenant" },
        { status: 404 }
      );
    }
    resolveViolation(id);
    return NextResponse.json({
      action: "resolve_violation",
      id,
      summary: getViolationSummary(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_rule', 'evaluate_rules', 'effective_action', 'request_approval', 'resolve_approval', 'expire_stale_approvals', 'register_restricted_action', 'check_action_allowed', 'record_execution', 'record_violation', or 'resolve_violation'.`,
    },
    { status: 400 }
  );
}
