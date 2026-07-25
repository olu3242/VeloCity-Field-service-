// GET  /api/admin/ai-quality — hallucination flags, confidence thresholds, calibration, recommendation scoring
// POST /api/admin/ai-quality — set_threshold | update_calibration | check_hallucination
// Admin-only.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  checkForHallucination,
  getFlaggedChecks,
  getHallucinationRate,
  getRecentChecks,
} from "@/lib/ai-quality/hallucination-guard";
import {
  getAllThresholds,
  setThreshold as setConfidenceThreshold,
  evaluateConfidence,
  type ThresholdConfig,
} from "@/lib/ai-quality/confidence-threshold";
import {
  getCalibrationReport,
  updateCalibration,
  scoreRecommendation,
  getThreshold as getRecommendationThreshold,
  setThreshold as setRecommendationThreshold,
} from "@/lib/ai-quality/recommendation-scorer";

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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const agentName = url.searchParams.get("agentName") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const flaggedChecks = getFlaggedChecks(agentName);
  const recentChecks = getRecentChecks(limit);
  const thresholds = getAllThresholds();
  const calibrationReport = getCalibrationReport();
  const recommendationThreshold = getRecommendationThreshold();

  // Hallucination rate per agent
  const agentNames = Array.from(new Set(recentChecks.map((c) => c.agentName)));
  const hallucinationRates: Record<string, number> = {};
  for (const name of agentNames) {
    hallucinationRates[name] = getHallucinationRate(name);
  }

  return NextResponse.json({
    hallucination: {
      flagged: flaggedChecks,
      recent: recentChecks,
      rates: hallucinationRates,
      flaggedCount: flaggedChecks.length,
    },
    confidenceThresholds: thresholds,
    calibration: {
      report: calibrationReport,
      recommendationThreshold,
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

  if (action === "set_threshold") {
    const { agentName, domain, minConfidence, warnConfidence, autoApproveConfidence } =
      body as Record<string, unknown>;

    if (typeof agentName !== "string" || typeof domain !== "string") {
      return NextResponse.json({ error: "agentName and domain required" }, { status: 400 });
    }

    const config: ThresholdConfig = {
      agentName,
      domain,
      minConfidence: typeof minConfidence === "number" ? minConfidence : 0.6,
      warnConfidence: typeof warnConfidence === "number" ? warnConfidence : 0.75,
      autoApproveConfidence: typeof autoApproveConfidence === "number" ? autoApproveConfidence : 0.92,
    };

    setConfidenceThreshold(config);
    return NextResponse.json({ action: "set_threshold", config, success: true });
  }

  if (action === "set_recommendation_threshold") {
    const { threshold } = body as Record<string, unknown>;
    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) {
      return NextResponse.json({ error: "threshold must be a number between 0 and 1" }, { status: 400 });
    }
    setRecommendationThreshold(threshold);
    return NextResponse.json({ action: "set_recommendation_threshold", threshold, success: true });
  }

  if (action === "update_calibration") {
    const { agentName, domain, accuracy } = body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof domain !== "string" || typeof accuracy !== "number") {
      return NextResponse.json(
        { error: "agentName, domain, and accuracy required" },
        { status: 400 }
      );
    }
    updateCalibration(agentName, domain, accuracy);
    return NextResponse.json({ action: "update_calibration", agentName, domain, accuracy, success: true });
  }

  if (action === "check_hallucination") {
    const { agentName, output, confidence } = body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof confidence !== "number") {
      return NextResponse.json({ error: "agentName and confidence required" }, { status: 400 });
    }
    const result = checkForHallucination(
      agentName,
      (output as Record<string, unknown>) ?? {},
      confidence
    );
    return NextResponse.json({ action: "check_hallucination", result, success: true });
  }

  if (action === "evaluate_confidence") {
    const { agentName, domain, confidence } = body as Record<string, unknown>;
    if (typeof agentName !== "string" || typeof domain !== "string" || typeof confidence !== "number") {
      return NextResponse.json(
        { error: "agentName, domain, and confidence required" },
        { status: 400 }
      );
    }
    const decision = evaluateConfidence(agentName, domain, confidence);
    return NextResponse.json({ action: "evaluate_confidence", decision, confidence, success: true });
  }

  if (action === "score_recommendation") {
    const { recommendationId, agentName, domain, confidenceScore } = body as Record<string, unknown>;
    if (
      typeof recommendationId !== "string" ||
      typeof agentName !== "string" ||
      typeof domain !== "string" ||
      typeof confidenceScore !== "number"
    ) {
      return NextResponse.json(
        { error: "recommendationId, agentName, domain, and confidenceScore required" },
        { status: 400 }
      );
    }
    const quality = scoreRecommendation(recommendationId, agentName, domain, confidenceScore);
    return NextResponse.json({ action: "score_recommendation", quality, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'set_threshold', 'set_recommendation_threshold', 'update_calibration', 'check_hallucination', 'evaluate_confidence', or 'score_recommendation'.`,
    },
    { status: 400 }
  );
}
