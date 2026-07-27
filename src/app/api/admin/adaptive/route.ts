// GET  /api/admin/adaptive — active tuning config, bounds, history, pending/applied proposals, signals
// POST /api/admin/adaptive — record_pattern | generate_signals | apply_signal
//                            | propose_adaptation | approve_proposal | reject_proposal | rollback_proposal
//                            | explain_proposal | apply_tuning | reset_to_defaults
// Admin-only. Tuning config and adaptation proposals are process-global platform state, so every
// mutating action requires super_admin — a single tenant's admin must not retune the whole runtime.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordPattern,
  generateTuningSignals,
  applySignal,
  getActiveTuningSignals,
  getRollbackCapability,
  type RuntimePattern,
} from "@/lib/adaptive/runtime-learner";
import {
  proposeAdaptation,
  approveProposal,
  rejectProposal,
  rollbackProposal,
  getPendingProposals,
  getAppliedProposals,
  getProposalExplanation,
  type AdaptationProposal,
} from "@/lib/adaptive/safe-adaptation";
import {
  getCurrentConfig,
  applyTuning,
  resetToDefaults,
  getTuningHistory,
  explainCurrentConfig,
  DEFAULT_TUNING,
  TUNING_BOUNDS,
  type TuningConfig,
} from "@/lib/adaptive/self-tuner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PATTERN_TYPES: RuntimePattern["patternType"][] = [
  "retry_success", "escalation_timing", "notification_response",
  "workflow_bottleneck", "ai_accuracy",
];
const VALID_SOURCES: AdaptationProposal["source"][] = [
  "learning_engine", "operator", "telemetry", "anomaly_detection",
];
const VALID_RISK_LEVELS: AdaptationProposal["riskLevel"][] = ["low", "medium", "high"];
const TUNING_FIELDS = Object.keys(DEFAULT_TUNING) as Array<keyof TuningConfig>;

function isTuningField(value: unknown): value is keyof TuningConfig {
  return typeof value === "string" && TUNING_FIELDS.includes(value as keyof TuningConfig);
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const proposalId = url.searchParams.get("proposalId");

  return NextResponse.json({
    tuning: {
      current: getCurrentConfig(),
      defaults: DEFAULT_TUNING,
      bounds: TUNING_BOUNDS,
      explanation: explainCurrentConfig(),
      history: getTuningHistory(),
    },
    proposals: {
      pending: getPendingProposals(),
      applied: getAppliedProposals(),
      ...(proposalId ? { explanation: getProposalExplanation(proposalId) } : {}),
    },
    learning: {
      activeSignals: getActiveTuningSignals(),
      rollbackCapability: getRollbackCapability(),
      supportedPatternTypes: VALID_PATTERN_TYPES,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
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

  // Every action below except the read-only explain/generate pair mutates
  // process-global runtime state shared by all tenants.
  const MUTATING_ACTIONS = new Set([
    "apply_signal", "propose_adaptation", "approve_proposal", "reject_proposal",
    "rollback_proposal", "apply_tuning", "reset_to_defaults", "record_pattern",
  ]);
  if (typeof action === "string" && MUTATING_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters platform-wide runtime state and requires super_admin` },
      { status: 403 }
    );
  }

  if (action === "record_pattern") {
    const { patternType, sampleSize, value, context } = raw;
    if (!VALID_PATTERN_TYPES.includes(patternType as RuntimePattern["patternType"])) {
      return NextResponse.json(
        { error: `patternType must be one of: ${VALID_PATTERN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof sampleSize !== "number" || !Number.isInteger(sampleSize) || sampleSize <= 0) {
      return NextResponse.json({ error: "sampleSize must be a positive integer" }, { status: 400 });
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ error: "value must be a number" }, { status: 400 });
    }
    const pattern = recordPattern({
      patternType: patternType as RuntimePattern["patternType"],
      sampleSize,
      value,
      context: context && typeof context === "object" ? (context as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "record_pattern", pattern, success: true }, { status: 201 });
  }

  if (action === "generate_signals") {
    const signals = generateTuningSignals();
    return NextResponse.json({
      action: "generate_signals",
      signals,
      active: getActiveTuningSignals(),
      success: true,
    });
  }

  if (action === "apply_signal") {
    const { signalId } = raw;
    if (typeof signalId !== "string" || signalId.trim() === "") {
      return NextResponse.json({ error: "signalId required" }, { status: 400 });
    }
    const applied = applySignal(signalId);
    if (!applied) {
      return NextResponse.json({ error: `Unknown or already-applied signalId: ${signalId}` }, { status: 404 });
    }
    return NextResponse.json({
      action: "apply_signal",
      signalId,
      active: getActiveTuningSignals(),
      success: true,
    });
  }

  if (action === "propose_adaptation") {
    const { source, target, currentValue, proposedValue, justification, riskLevel } = raw;
    if (!VALID_SOURCES.includes(source as AdaptationProposal["source"])) {
      return NextResponse.json(
        { error: `source must be one of: ${VALID_SOURCES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof target !== "string" || target.trim() === "") {
      return NextResponse.json({ error: "target required" }, { status: 400 });
    }
    if (typeof justification !== "string" || justification.trim() === "") {
      return NextResponse.json({ error: "justification required" }, { status: 400 });
    }
    if (!VALID_RISK_LEVELS.includes(riskLevel as AdaptationProposal["riskLevel"])) {
      return NextResponse.json(
        { error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }
    const proposal = proposeAdaptation({
      source: source as AdaptationProposal["source"],
      target,
      currentValue,
      proposedValue,
      justification,
      riskLevel: riskLevel as AdaptationProposal["riskLevel"],
    });
    // Low-risk proposals are auto-approved by the lib — surface that so the caller
    // knows no human gate was applied.
    return NextResponse.json(
      { action: "propose_adaptation", proposal, autoApproved: proposal.status === "approved", success: true },
      { status: 201 }
    );
  }

  if (action === "approve_proposal" || action === "reject_proposal" || action === "rollback_proposal") {
    const { id } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // The resolving admin is taken from the authenticated session, never the body,
    // so the audit trail cannot be forged.
    const adminId = auth.userId;
    const resolved =
      action === "approve_proposal"
        ? approveProposal(id, adminId)
        : action === "reject_proposal"
        ? rejectProposal(id, adminId)
        : rollbackProposal(id, adminId);

    if (!resolved) {
      return NextResponse.json({ error: `Unknown proposal id: ${id}` }, { status: 404 });
    }
    return NextResponse.json({
      action,
      id,
      explanation: getProposalExplanation(id),
      success: true,
    });
  }

  if (action === "explain_proposal") {
    const { id } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "explain_proposal",
      explanation: getProposalExplanation(id),
      success: true,
    });
  }

  if (action === "apply_tuning") {
    const { field, value, reason } = raw;
    if (!isTuningField(field)) {
      return NextResponse.json(
        { error: `field must be one of: ${TUNING_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ error: "value must be a number" }, { status: 400 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required for audit trail" }, { status: 400 });
    }
    const result = applyTuning(field, value, reason);
    // A paused runtime or out-of-bounds value is a precondition failure, not a
    // server error — and never a silent success.
    return NextResponse.json(
      { action: "apply_tuning", field, result, config: getCurrentConfig(), success: result.applied },
      { status: result.applied ? 200 : 409 }
    );
  }

  if (action === "reset_to_defaults") {
    const { reason } = raw;
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required for audit trail" }, { status: 400 });
    }
    resetToDefaults(reason);
    return NextResponse.json({
      action: "reset_to_defaults",
      config: getCurrentConfig(),
      history: getTuningHistory(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_pattern', 'generate_signals', 'apply_signal', 'propose_adaptation', 'approve_proposal', 'reject_proposal', 'rollback_proposal', 'explain_proposal', 'apply_tuning', or 'reset_to_defaults'.`,
    },
    { status: 400 }
  );
}
