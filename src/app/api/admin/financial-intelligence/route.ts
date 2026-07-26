// GET  /api/admin/financial-intelligence — high-risk tenants, all forecasts, latest metrics, automation ROI
// POST /api/admin/financial-intelligence — score_risk | generate_forecast | record_metrics
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreFinancialRisk,
  getRiskScore,
  getHighRiskTenants,
} from "@/lib/financial-intelligence/financial-risk-scorer";
import {
  generateForecast,
  getLatestForecast,
  getAllForecasts,
  type FinancialForecast,
} from "@/lib/financial-intelligence/forecasting-engine";
import {
  recordMarketplaceMetrics,
  getLatestMetrics,
  getMetricsHistory,
  getAutomationROI,
} from "@/lib/financial-intelligence/marketplace-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_METRIC_TYPES: FinancialForecast["metricType"][] = [
  "revenue", "volume", "disputes", "commissions",
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
  const metricType = url.searchParams.get("metricType") as FinancialForecast["metricType"] | null;
  const metricsLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const highRiskTenants = getHighRiskTenants();
  const tenantRiskScore = getRiskScore(tenantId);
  const allForecasts = getAllForecasts();
  const latestMetrics = getLatestMetrics();
  const metricsHistory = getMetricsHistory(metricsLimit);
  const automationROI = getAutomationROI();

  return NextResponse.json({
    tenantId,
    risk: {
      tenantScore: tenantRiskScore ?? null,
      highRiskTenants,
      highRiskCount: highRiskTenants.length,
    },
    forecasts: {
      all: allForecasts,
      ...(metricType && VALID_METRIC_TYPES.includes(metricType)
        ? { latest: getLatestForecast(metricType) }
        : {}),
    },
    marketplace: {
      latestMetrics: latestMetrics ?? null,
      history: metricsHistory,
      automationROI,
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

  if (action === "score_risk") {
    const { disputeRate, chargebackRate, outstandingBalanceUsd, daysSinceLastPayment } =
      body as Record<string, unknown>;

    if (
      typeof disputeRate !== "number" ||
      typeof chargebackRate !== "number" ||
      typeof outstandingBalanceUsd !== "number" ||
      typeof daysSinceLastPayment !== "number"
    ) {
      return NextResponse.json(
        { error: "disputeRate, chargebackRate, outstandingBalanceUsd, and daysSinceLastPayment required" },
        { status: 400 }
      );
    }

    const score = scoreFinancialRisk(tenantId, {
      disputeRate,
      chargebackRate,
      outstandingBalanceUsd,
      daysSinceLastPayment,
    });
    return NextResponse.json({ action: "score_risk", score, success: true });
  }

  if (action === "generate_forecast") {
    const { metricType, historicalValues, forecastPeriod } = body as Record<string, unknown>;

    if (!VALID_METRIC_TYPES.includes(metricType as FinancialForecast["metricType"])) {
      return NextResponse.json(
        { error: `metricType must be one of: ${VALID_METRIC_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(historicalValues)) {
      return NextResponse.json({ error: "historicalValues array required" }, { status: 400 });
    }
    if (typeof forecastPeriod !== "string") {
      return NextResponse.json({ error: "forecastPeriod required" }, { status: 400 });
    }

    const forecast = generateForecast(
      metricType as FinancialForecast["metricType"],
      historicalValues as number[],
      forecastPeriod
    );
    return NextResponse.json({ action: "generate_forecast", forecast, success: true });
  }

  if (action === "record_metrics") {
    const {
      period,
      totalTransactions,
      totalVolumeUsd,
      disputeRate,
      chargebackRate,
      automationSavingsUsd,
    } = body as Record<string, unknown>;

    if (typeof period !== "string") {
      return NextResponse.json({ error: "period required" }, { status: 400 });
    }
    if (
      typeof totalTransactions !== "number" ||
      typeof totalVolumeUsd !== "number" ||
      typeof disputeRate !== "number" ||
      typeof chargebackRate !== "number" ||
      typeof automationSavingsUsd !== "number"
    ) {
      return NextResponse.json(
        { error: "totalTransactions, totalVolumeUsd, disputeRate, chargebackRate, and automationSavingsUsd required" },
        { status: 400 }
      );
    }

    const metric = recordMarketplaceMetrics(
      period,
      totalTransactions,
      totalVolumeUsd,
      disputeRate,
      chargebackRate,
      automationSavingsUsd
    );
    return NextResponse.json({ action: "record_metrics", metric, success: true }, { status: 201 });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'score_risk', 'generate_forecast', or 'record_metrics'.` },
    { status: 400 }
  );
}
