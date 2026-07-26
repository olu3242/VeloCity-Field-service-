// GET  /api/admin/financial — unified financial intelligence: risk, forecasts, marketplace analytics
// POST /api/admin/financial — score_risk | generate_forecast | record_metrics
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreFinancialRisk, getHighRiskTenants, getRiskScore,
} from "@/lib/financial-intelligence/financial-risk-scorer";
import {
  generateForecast, getAllForecasts, getLatestForecast,
  type FinancialForecast,
} from "@/lib/financial-intelligence/forecasting-engine";
import {
  recordMarketplaceMetrics, getLatestMetrics, getMetricsHistory, getAutomationROI,
} from "@/lib/financial-intelligence/marketplace-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_METRIC_TYPES: FinancialForecast["metricType"][] = ["revenue", "volume", "disputes", "commissions"];

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
  const metricType = url.searchParams.get("metricType") as FinancialForecast["metricType"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    risk: {
      highRisk: getHighRiskTenants(),
      score: getRiskScore(tenantId) ?? null,
    },
    forecasts: {
      all: getAllForecasts(),
      ...(metricType && VALID_METRIC_TYPES.includes(metricType) ? { latest: getLatestForecast(metricType) ?? null } : {}),
    },
    marketplace: {
      latestMetrics: getLatestMetrics(),
      history: getMetricsHistory(limit),
      roi: getAutomationROI(),
    },
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

  if (action === "score_risk") {
    const { disputeRate, chargebackRate, outstandingBalanceUsd, daysSinceLastPayment, targetTenantId } = body as Record<string, unknown>;
    if (typeof disputeRate !== "number" || typeof chargebackRate !== "number") {
      return NextResponse.json({ error: "disputeRate and chargebackRate required" }, { status: 400 });
    }
    const score = scoreFinancialRisk(
      typeof targetTenantId === "string" ? targetTenantId : tenantId,
      {
        disputeRate,
        chargebackRate,
        outstandingBalanceUsd: typeof outstandingBalanceUsd === "number" ? outstandingBalanceUsd : 0,
        daysSinceLastPayment: typeof daysSinceLastPayment === "number" ? daysSinceLastPayment : 0,
      }
    );
    return NextResponse.json({ action, score, success: true }, { status: 201 });
  }

  if (action === "generate_forecast") {
    const { metricType, historicalValues, forecastPeriod } = body as Record<string, unknown>;
    if (!VALID_METRIC_TYPES.includes(metricType as FinancialForecast["metricType"])) {
      return NextResponse.json({ error: `metricType must be one of: ${VALID_METRIC_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!Array.isArray(historicalValues)) return NextResponse.json({ error: "historicalValues array required" }, { status: 400 });
    const forecast = generateForecast(
      metricType as FinancialForecast["metricType"],
      historicalValues as number[],
      typeof forecastPeriod === "string" ? forecastPeriod : "next_30_days"
    );
    return NextResponse.json({ action, forecast, success: true }, { status: 201 });
  }

  if (action === "record_metrics") {
    const { period, totalTransactions, totalVolumeUsd, disputeRate, chargebackRate, automationSavingsUsd } = body as Record<string, unknown>;
    if (typeof totalTransactions !== "number") return NextResponse.json({ error: "totalTransactions required" }, { status: 400 });
    const metric = recordMarketplaceMetrics(
      typeof period === "string" ? period : new Date().toISOString().slice(0, 7),
      totalTransactions,
      typeof totalVolumeUsd === "number" ? totalVolumeUsd : 0,
      typeof disputeRate === "number" ? disputeRate : 0,
      typeof chargebackRate === "number" ? chargebackRate : 0,
      typeof automationSavingsUsd === "number" ? automationSavingsUsd : 0
    );
    return NextResponse.json({ action, metric, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'score_risk', 'generate_forecast', or 'record_metrics'.` }, { status: 400 });
}
