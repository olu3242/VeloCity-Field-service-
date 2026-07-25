// GET  /api/admin/intelligence — learning report, feedback summary, anomaly intelligence
// POST /api/admin/intelligence — record_outcome | record_feedback | optimize_decision | record_anomaly
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getLearningReport,
  getSignals,
  type WorkflowOutcome,
  recordOutcome,
} from "@/lib/intelligence/learning-engine";
import {
  getFeedbackSummary,
  getAgentEffectiveness,
  getTopInsights,
  recordFeedback,
  type FeedbackRecord,
} from "@/lib/intelligence/feedback-loops";
import {
  optimizeDecision,
  batchOptimize,
  type OptimizationContext,
  type DecisionDomain,
} from "@/lib/intelligence/decision-optimization";
import {
  buildIntelligenceReport,
  recordAnomaly,
  type AnomalyCluster,
  type AnomalyCategory,
} from "@/lib/intelligence/anomaly-intelligence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DOMAINS: DecisionDomain[] = [
  "dispute_routing", "escalation_timing", "payout_prioritization",
  "retry_strategy", "provider_intervention", "workflow_path",
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
  const domain = url.searchParams.get("domain") ?? "all";
  const agentName = url.searchParams.get("agentName");
  const workflowId = url.searchParams.get("workflowId");

  const learningReport = getLearningReport();
  const feedbackSummary = getFeedbackSummary(domain, tenantId);
  const topInsights = getTopInsights(10);
  const anomalyReport = buildIntelligenceReport();
  const signals = workflowId ? getSignals(workflowId) : getSignals();

  return NextResponse.json({
    tenantId,
    learning: {
      report: learningReport,
      signals: signals.slice(0, 20),
    },
    feedback: {
      summary: feedbackSummary,
      topInsights,
      ...(agentName ? { agentEffectiveness: getAgentEffectiveness(agentName) } : {}),
    },
    anomalies: anomalyReport,
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

  if (action === "record_outcome") {
    const { workflowId, outcomeType, durationMs, stepsCompleted, stepsFailed,
      humanInterventions, aiDecisions, finalStatus, metadata } = body as Record<string, unknown>;

    if (typeof workflowId !== "string" || typeof outcomeType !== "string") {
      return NextResponse.json({ error: "workflowId and outcomeType required" }, { status: 400 });
    }

    const outcome = recordOutcome({
      workflowId,
      outcomeType: outcomeType as WorkflowOutcome["outcomeType"],
      durationMs: typeof durationMs === "number" ? durationMs : 0,
      stepsCompleted: typeof stepsCompleted === "number" ? stepsCompleted : 0,
      stepsFailed: typeof stepsFailed === "number" ? stepsFailed : 0,
      humanInterventions: typeof humanInterventions === "number" ? humanInterventions : 0,
      aiDecisions: typeof aiDecisions === "number" ? aiDecisions : 0,
      finalStatus: (["success", "partial", "failed", "escalated"].includes(finalStatus as string)
        ? finalStatus : "success") as WorkflowOutcome["finalStatus"],
      metadata: (metadata && typeof metadata === "object") ? (metadata as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "record_outcome", outcome, success: true });
  }

  if (action === "record_feedback") {
    const { agentName, domain, feedbackType, score, notes } = body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof domain !== "string") {
      return NextResponse.json({ error: "agentName and domain required" }, { status: 400 });
    }

    const feedback = recordFeedback({
      agentName,
      domain,
      feedbackType: (feedbackType as FeedbackRecord["feedbackType"]) ?? "recommendation_accepted",
      impact: (["positive", "negative", "neutral"].includes((body as Record<string, unknown>).impact as string)
        ? (body as Record<string, unknown>).impact : "positive") as FeedbackRecord["impact"],
      metadata: { score, notes, ...(typeof (body as Record<string, unknown>).metadata === "object" ? (body as Record<string, unknown>).metadata as Record<string, unknown> : {}) },
      tenantId,
    });
    return NextResponse.json({ action: "record_feedback", feedback, success: true });
  }

  if (action === "optimize_decision") {
    const { domain, entityId, currentStrategy, signals, batch } = body as Record<string, unknown>;

    if (Array.isArray(batch)) {
      const contexts = (batch as Record<string, unknown>[]).filter(
        (c) => VALID_DOMAINS.includes(c.domain as DecisionDomain)
      ).map((c) => ({
        domain: c.domain as DecisionDomain,
        entityId: typeof c.entityId === "string" ? c.entityId : "unknown",
        tenantId,
        currentStrategy: typeof c.currentStrategy === "string" ? c.currentStrategy : "default",
        signals: (c.signals && typeof c.signals === "object") ? (c.signals as Record<string, number>) : {},
      }));
      const recommendations = batchOptimize(contexts);
      return NextResponse.json({ action: "optimize_decision", recommendations, success: true });
    }

    if (!VALID_DOMAINS.includes(domain as DecisionDomain)) {
      return NextResponse.json(
        { error: `domain must be one of: ${VALID_DOMAINS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof entityId !== "string") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }

    const ctx: OptimizationContext = {
      domain: domain as DecisionDomain,
      entityId,
      tenantId,
      currentStrategy: typeof currentStrategy === "string" ? currentStrategy : "default",
      signals: (signals && typeof signals === "object") ? (signals as Record<string, number>) : {},
    };
    const recommendation = optimizeDecision(ctx);
    return NextResponse.json({ action: "optimize_decision", recommendation, success: true });
  }

  if (action === "record_anomaly") {
    const { anomalyType, category, severity, entityId } = body as Record<string, unknown>;

    if (typeof anomalyType !== "string" || typeof category !== "string") {
      return NextResponse.json({ error: "anomalyType and category required" }, { status: 400 });
    }

    const resolvedSeverity = (["low", "medium", "high", "critical"].includes(severity as string)
      ? severity : "medium") as AnomalyCluster["severity"];

    recordAnomaly(
      anomalyType,
      category as AnomalyCluster["category"],
      resolvedSeverity,
      typeof entityId === "string" ? entityId : undefined
    );
    return NextResponse.json({ action: "record_anomaly", anomalyType, category, severity: resolvedSeverity, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_outcome', 'record_feedback', 'optimize_decision', or 'record_anomaly'.` },
    { status: 400 }
  );
}
