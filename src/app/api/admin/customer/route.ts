// GET  /api/admin/customer — customer success intelligence: feedback, outcomes, learning signals
// POST /api/admin/customer — record_feedback | record_outcome | record_learning
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordFeedback, getFeedbackSummary, getTopInsights,
  type FeedbackType,
} from "@/lib/intelligence/feedback-loops";
import {
  recordOutcome, getSignals, getLearningReport,
  type OutcomeType,
} from "@/lib/intelligence/learning-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_FEEDBACK_TYPES: FeedbackType[] = [
  "recommendation_accepted", "recommendation_rejected", "override_by_admin",
  "outcome_positive", "outcome_negative", "escalation_resolved", "escalation_failed",
];
const VALID_OUTCOME_TYPES: OutcomeType[] = [
  "dispute_resolved", "payout_released", "job_completed", "escalation_triggered",
  "workflow_completed", "sla_breached", "retry_succeeded", "retry_failed",
];
const VALID_IMPACT = ["positive", "negative", "neutral"];
const VALID_FINAL_STATUS = ["success", "partial", "failed", "escalated"];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return { error: "Forbidden", status: 403 as const, profile: null };
  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "customer";
  const outcomeType = url.searchParams.get("outcomeType") as OutcomeType | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  void limit;
  return NextResponse.json({
    feedback: {
      summary: getFeedbackSummary(domain, tenantId),
      topInsights: getTopInsights(10),
    },
    outcomes: {
      report: getLearningReport(),
      ...(outcomeType && VALID_OUTCOME_TYPES.includes(outcomeType)
        ? { signalsForType: getSignals().filter(s => s.signal.includes(outcomeType)) }
        : {}),
    },
    learning: { signals: getSignals() },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "record_feedback") {
    const { domain, feedbackType, impact, agentName, metadata } = body as Record<string, unknown>;
    if (!VALID_FEEDBACK_TYPES.includes(feedbackType as FeedbackType)) {
      return NextResponse.json({ error: `feedbackType must be one of: ${VALID_FEEDBACK_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_IMPACT.includes(impact as string)) {
      return NextResponse.json({ error: "impact must be positive, negative, or neutral" }, { status: 400 });
    }
    const fb = recordFeedback({
      domain: typeof domain === "string" ? domain : "customer",
      feedbackType: feedbackType as FeedbackType,
      tenantId,
      impact: impact as "positive" | "negative" | "neutral",
      agentName: typeof agentName === "string" ? agentName : undefined,
      metadata: typeof metadata === "object" && metadata ? metadata as Record<string, unknown> : {},
    });
    return NextResponse.json({ action, feedback: fb, success: true }, { status: 201 });
  }

  if (action === "record_outcome") {
    const { workflowId, outcomeType, durationMs, stepsCompleted, stepsFailed, humanInterventions, aiDecisions, finalStatus, metadata } = body as Record<string, unknown>;
    if (typeof workflowId !== "string") return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    if (!VALID_OUTCOME_TYPES.includes(outcomeType as OutcomeType)) {
      return NextResponse.json({ error: `outcomeType must be one of: ${VALID_OUTCOME_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_FINAL_STATUS.includes(finalStatus as string)) {
      return NextResponse.json({ error: "finalStatus must be success, partial, failed, or escalated" }, { status: 400 });
    }
    const outcome = recordOutcome({
      workflowId,
      outcomeType: outcomeType as OutcomeType,
      durationMs: typeof durationMs === "number" ? durationMs : 0,
      stepsCompleted: typeof stepsCompleted === "number" ? stepsCompleted : 0,
      stepsFailed: typeof stepsFailed === "number" ? stepsFailed : 0,
      humanInterventions: typeof humanInterventions === "number" ? humanInterventions : 0,
      aiDecisions: typeof aiDecisions === "number" ? aiDecisions : 0,
      finalStatus: finalStatus as "success" | "partial" | "failed" | "escalated",
      metadata: typeof metadata === "object" && metadata ? metadata as Record<string, unknown> : {},
    });
    return NextResponse.json({ action, outcome, success: true }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'record_feedback' or 'record_outcome'.` }, { status: 400 });
}
