// GET  /api/admin/economics — cost model constants and supported calculators
// POST /api/admin/economics — score_tenant_health | score_provider_network | executive_metrics
//                             | analyze_queue_costs | analyze_dispute_costs | analyze_payout_efficiency
//                             | calculate_roi | score_workflow_efficiency | roi_summary | full_report
// Admin-only; tenant-scoped. Pure economic calculators — computed from supplied operational inputs,
// no persisted state. Tenant health always scores the caller's own tenant.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreTenantHealth,
  scoreProviderNetworkHealth,
  buildExecutiveMetrics,
} from "@/lib/economics/business-health";
import {
  analyzeQueueCosts,
  analyzeDisputeCosts,
  analyzePayoutEfficiency,
} from "@/lib/economics/cost-analytics";
import {
  calculateROI,
  scoreWorkflowEfficiency,
  getROISummary,
  type AutomationROIMetrics,
} from "@/lib/economics/roi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Rates are proportions — reject out-of-range input rather than silently clamping,
// since a rate above 1 almost always signals the caller sent a percentage.
function requireRate(value: unknown, name: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return `${name} must be a number between 0 and 1`;
  }
  return null;
}

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
  void request;

  return NextResponse.json({
    calculators: {
      businessHealth: ["score_tenant_health", "score_provider_network", "executive_metrics"],
      costAnalytics: ["analyze_queue_costs", "analyze_dispute_costs", "analyze_payout_efficiency"],
      roi: ["calculate_roi", "score_workflow_efficiency", "roi_summary"],
      composite: ["full_report"],
    },
    notes: {
      rates: "All *Rate inputs are proportions in the range 0–1, not percentages.",
      currency: "Cost inputs are USD unless the field name ends in Cents.",
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

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "score_tenant_health") {
    const { automationSuccessRate, disputeRate, payoutDelayDays, activeProviders, aiCallSuccessRate } = raw;
    for (const [name, value] of [
      ["automationSuccessRate", automationSuccessRate],
      ["disputeRate", disputeRate],
      ["aiCallSuccessRate", aiCallSuccessRate],
    ] as const) {
      const err = requireRate(value, name);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const score = scoreTenantHealth({
      // Always the caller's own tenant — never read from the body.
      tenantId,
      automationSuccessRate: automationSuccessRate as number,
      disputeRate: disputeRate as number,
      payoutDelayDays: num(payoutDelayDays, 0),
      activeProviders: num(activeProviders, 0),
      aiCallSuccessRate: aiCallSuccessRate as number,
    });
    return NextResponse.json({ action: "score_tenant_health", score, success: true });
  }

  if (action === "score_provider_network") {
    const { activeProviders, avgTrustScore, atRiskCount, coverageGaps } = raw;
    if (typeof activeProviders !== "number" || typeof avgTrustScore !== "number") {
      return NextResponse.json(
        { error: "activeProviders and avgTrustScore must be numbers" },
        { status: 400 }
      );
    }
    const health = scoreProviderNetworkHealth({
      activeProviders,
      avgTrustScore,
      atRiskCount: num(atRiskCount, 0),
      ...(Array.isArray(coverageGaps) ? { coverageGaps: coverageGaps as string[] } : {}),
    });
    return NextResponse.json({ action: "score_provider_network", health, success: true });
  }

  if (action === "executive_metrics") {
    const { netROIUsd, automationRate, aiSuccessRate, avgDisputeCostUsd, disputesAutoResolved, disputesTotal } = raw;
    for (const [name, value] of [
      ["automationRate", automationRate],
      ["aiSuccessRate", aiSuccessRate],
    ] as const) {
      const err = requireRate(value, name);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const metrics = buildExecutiveMetrics({
      netROIUsd: num(netROIUsd, 0),
      automationRate: automationRate as number,
      aiSuccessRate: aiSuccessRate as number,
      avgDisputeCostUsd: num(avgDisputeCostUsd, 0),
      disputesAutoResolved: num(disputesAutoResolved, 0),
      disputesTotal: num(disputesTotal, 0),
    });
    return NextResponse.json({ action: "executive_metrics", metrics, success: true });
  }

  if (action === "analyze_queue_costs") {
    const { total, failed, retries, costPerItemCents } = raw;
    if (typeof total !== "number" || typeof failed !== "number") {
      return NextResponse.json({ error: "total and failed must be numbers" }, { status: 400 });
    }
    if (failed > total) {
      return NextResponse.json({ error: "failed cannot exceed total" }, { status: 400 });
    }
    const metrics = analyzeQueueCosts({
      total,
      failed,
      retries: num(retries, 0),
      ...(typeof costPerItemCents === "number" ? { costPerItemCents } : {}),
    });
    return NextResponse.json({ action: "analyze_queue_costs", metrics, success: true });
  }

  if (action === "analyze_dispute_costs") {
    const { openDisputes, avgResolutionDays, automatedRate } = raw;
    if (typeof openDisputes !== "number") {
      return NextResponse.json({ error: "openDisputes must be a number" }, { status: 400 });
    }
    const err = requireRate(automatedRate, "automatedRate");
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const metrics = analyzeDisputeCosts({
      openDisputes,
      avgResolutionDays: num(avgResolutionDays, 0),
      automatedRate: automatedRate as number,
    });
    return NextResponse.json({ action: "analyze_dispute_costs", metrics, success: true });
  }

  if (action === "analyze_payout_efficiency") {
    const { total, autoReleased, avgProcessingDays } = raw;
    if (typeof total !== "number" || typeof autoReleased !== "number") {
      return NextResponse.json({ error: "total and autoReleased must be numbers" }, { status: 400 });
    }
    if (autoReleased > total) {
      return NextResponse.json({ error: "autoReleased cannot exceed total" }, { status: 400 });
    }
    const metrics = analyzePayoutEfficiency({
      total,
      autoReleased,
      avgProcessingDays: num(avgProcessingDays, 0),
    });
    return NextResponse.json({ action: "analyze_payout_efficiency", metrics, success: true });
  }

  if (action === "calculate_roi") {
    const { eventsAuto, eventsTotal, aiCostUsd, periodLabel } = raw;
    if (typeof eventsAuto !== "number" || typeof eventsTotal !== "number") {
      return NextResponse.json(
        { error: "eventsAuto and eventsTotal must be numbers" },
        { status: 400 }
      );
    }
    if (eventsAuto > eventsTotal) {
      return NextResponse.json({ error: "eventsAuto cannot exceed eventsTotal" }, { status: 400 });
    }
    if (typeof periodLabel !== "string" || periodLabel.trim() === "") {
      return NextResponse.json({ error: "periodLabel required" }, { status: 400 });
    }
    const roi = calculateROI({
      eventsAuto,
      eventsTotal,
      aiCostUsd: num(aiCostUsd, 0),
      periodLabel,
    });
    return NextResponse.json({ action: "calculate_roi", roi, success: true });
  }

  if (action === "score_workflow_efficiency") {
    const { workflowId, avgDurationMs, humanInterventionRate, successRate, avgCostUsd } = raw;
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    for (const [name, value] of [
      ["humanInterventionRate", humanInterventionRate],
      ["successRate", successRate],
    ] as const) {
      const err = requireRate(value, name);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const efficiency = scoreWorkflowEfficiency({
      workflowId,
      avgDurationMs: num(avgDurationMs, 0),
      humanInterventionRate: humanInterventionRate as number,
      successRate: successRate as number,
      avgCostUsd: num(avgCostUsd, 0),
    });
    return NextResponse.json({ action: "score_workflow_efficiency", efficiency, success: true });
  }

  if (action === "roi_summary") {
    const { periods } = raw;
    if (!Array.isArray(periods) || periods.length === 0) {
      return NextResponse.json({ error: "periods must be a non-empty array" }, { status: 400 });
    }

    // Each period is recomputed through calculateROI rather than trusted as a
    // pre-built metrics object, so the summary cannot be skewed by fabricated totals.
    const roiList: AutomationROIMetrics[] = [];
    for (const entry of periods) {
      if (!entry || typeof entry !== "object") {
        return NextResponse.json({ error: "each period must be an object" }, { status: 400 });
      }
      const p = entry as Record<string, unknown>;
      if (typeof p.eventsAuto !== "number" || typeof p.eventsTotal !== "number") {
        return NextResponse.json(
          { error: "each period requires numeric eventsAuto and eventsTotal" },
          { status: 400 }
        );
      }
      if (typeof p.periodLabel !== "string" || p.periodLabel.trim() === "") {
        return NextResponse.json({ error: "each period requires a periodLabel" }, { status: 400 });
      }
      roiList.push(
        calculateROI({
          eventsAuto: p.eventsAuto,
          eventsTotal: p.eventsTotal,
          aiCostUsd: num(p.aiCostUsd, 0),
          periodLabel: p.periodLabel,
        })
      );
    }

    return NextResponse.json({
      action: "roi_summary",
      periods: roiList,
      summary: getROISummary(roiList),
      success: true,
    });
  }

  if (action === "full_report") {
    // Composite economic picture in one call — ROI feeds the executive metrics
    // so netROIUsd is derived rather than caller-asserted.
    const { eventsAuto, eventsTotal, aiCostUsd, periodLabel, openDisputes, avgResolutionDays, automatedRate, aiSuccessRate } = raw;
    if (typeof eventsAuto !== "number" || typeof eventsTotal !== "number") {
      return NextResponse.json(
        { error: "eventsAuto and eventsTotal must be numbers" },
        { status: 400 }
      );
    }
    if (eventsAuto > eventsTotal) {
      return NextResponse.json({ error: "eventsAuto cannot exceed eventsTotal" }, { status: 400 });
    }
    for (const [name, value] of [
      ["automatedRate", automatedRate],
      ["aiSuccessRate", aiSuccessRate],
    ] as const) {
      const err = requireRate(value, name);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const roi = calculateROI({
      eventsAuto,
      eventsTotal,
      aiCostUsd: num(aiCostUsd, 0),
      periodLabel: typeof periodLabel === "string" && periodLabel.trim() !== "" ? periodLabel : "current",
    });
    const disputes = analyzeDisputeCosts({
      openDisputes: num(openDisputes, 0),
      avgResolutionDays: num(avgResolutionDays, 0),
      automatedRate: automatedRate as number,
    });

    return NextResponse.json({
      action: "full_report",
      report: {
        roi,
        disputes,
        executive: buildExecutiveMetrics({
          netROIUsd: roi.netROIUsd,
          automationRate: roi.automationRate,
          aiSuccessRate: aiSuccessRate as number,
          avgDisputeCostUsd: disputes.estimatedCostPerDispute,
          disputesAutoResolved: Math.round(disputes.openDisputes * (automatedRate as number)),
          disputesTotal: disputes.openDisputes,
        }),
      },
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'score_tenant_health', 'score_provider_network', 'executive_metrics', 'analyze_queue_costs', 'analyze_dispute_costs', 'analyze_payout_efficiency', 'calculate_roi', 'score_workflow_efficiency', 'roi_summary', or 'full_report'.`,
    },
    { status: 400 }
  );
}
