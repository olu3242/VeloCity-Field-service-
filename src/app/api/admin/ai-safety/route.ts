// GET  /api/admin/ai-safety — bias report, high-severity signals, ethics policies, unsafe log
// POST /api/admin/ai-safety — record_bias | evaluate_ethics | detect_unsafe | register_policy
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  recordBiasSignal,
  getBiasReport,
  getHighSeveritySignals,
} from "@/lib/ai-safety/bias-monitor";
import {
  evaluateEthics,
  getActivePolicies,
  registerPolicy,
  type EthicsPolicy,
} from "@/lib/ai-safety/ethics-policies";
import {
  detectUnsafeExecution,
  getUnsafeLog,
  getBlockedExecutions,
} from "@/lib/ai-safety/unsafe-detector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DIMENSIONS = ["tenant_size", "provider_tier", "geography", "dispute_value"] as const;
const VALID_SEVERITIES = ["low", "medium", "high"] as const;
const VALID_SCOPES = ["all", "financial", "dispute"] as const;

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
  const agentName = url.searchParams.get("agentName") ?? undefined;

  const biasReport = getBiasReport(agentName);
  const highSeveritySignals = getHighSeveritySignals();
  const activePolicies = getActivePolicies();
  const unsafeLog = getUnsafeLog(agentName);
  const blockedExecutions = getBlockedExecutions();

  return NextResponse.json({
    bias: {
      report: biasReport,
      highSeveritySignals: highSeveritySignals.slice(0, 50),
    },
    ethics: {
      activePolicies,
      count: activePolicies.length,
    },
    safety: {
      unsafeLog: unsafeLog.slice(0, 50),
      blockedExecutions: blockedExecutions.slice(0, 50),
      blockedCount: blockedExecutions.length,
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

  if (action === "record_bias") {
    const { agentName, dimension, detail, severity } = body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof detail !== "string") {
      return NextResponse.json({ error: "agentName and detail required" }, { status: 400 });
    }
    if (!VALID_DIMENSIONS.includes(dimension as typeof VALID_DIMENSIONS[number])) {
      return NextResponse.json(
        { error: `dimension must be one of: ${VALID_DIMENSIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_SEVERITIES.includes(severity as typeof VALID_SEVERITIES[number])) {
      return NextResponse.json(
        { error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
        { status: 400 }
      );
    }

    const signal = recordBiasSignal(
      agentName,
      dimension as typeof VALID_DIMENSIONS[number],
      detail,
      severity as typeof VALID_SEVERITIES[number]
    );
    return NextResponse.json({ action: "record_bias", signal, success: true });
  }

  if (action === "evaluate_ethics") {
    const { agentName, agentAction, scope } = body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof agentAction !== "string") {
      return NextResponse.json({ error: "agentName and agentAction required" }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope as typeof VALID_SCOPES[number])) {
      return NextResponse.json(
        { error: `scope must be one of: ${VALID_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }

    const evaluation = evaluateEthics(
      agentName,
      agentAction,
      scope as EthicsPolicy["scope"]
    );
    return NextResponse.json({ action: "evaluate_ethics", evaluation, success: true });
  }

  if (action === "detect_unsafe") {
    const { agentName, eventType, confidence, attemptedAction, tenantId } =
      body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ error: "agentName and eventType required" }, { status: 400 });
    }

    const result = detectUnsafeExecution(agentName, eventType, {
      confidence: typeof confidence === "number" ? confidence : 1,
      attemptedAction: typeof attemptedAction === "string" ? attemptedAction : "",
      tenantId: typeof tenantId === "string" ? tenantId : auth.profile.tenant_id ?? "",
    });
    return NextResponse.json({ action: "detect_unsafe", result, flagged: result !== null, success: true });
  }

  if (action === "register_policy") {
    const { policyId, name, rule, scope, policyAction } = body as Record<string, unknown>;

    if (
      typeof policyId !== "string" ||
      typeof name !== "string" ||
      typeof rule !== "string"
    ) {
      return NextResponse.json({ error: "policyId, name, and rule required" }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope as typeof VALID_SCOPES[number])) {
      return NextResponse.json(
        { error: `scope must be one of: ${VALID_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!["warn", "block", "require_human"].includes(policyAction as string)) {
      return NextResponse.json(
        { error: "policyAction must be one of: warn, block, require_human" },
        { status: 400 }
      );
    }

    const policy: EthicsPolicy = {
      policyId,
      name,
      rule,
      scope: scope as EthicsPolicy["scope"],
      action: policyAction as EthicsPolicy["action"],
      active: true,
    };
    registerPolicy(policy);
    return NextResponse.json({ action: "register_policy", policy, success: true }, { status: 201 });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_bias', 'evaluate_ethics', 'detect_unsafe', or 'register_policy'.` },
    { status: 400 }
  );
}
