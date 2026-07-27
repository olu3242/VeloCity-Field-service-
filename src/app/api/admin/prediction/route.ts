// GET  /api/admin/prediction — seasonal demand multipliers across every service category
// POST /api/admin/prediction — forecast_demand | forecast_provider_supply | forecast_sla_risk
//                              | category_trend | detect_anomalies
// Admin-only; tenant-scoped. Pure forecasting surface — computes from supplied operational inputs.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import type { ServiceCategory } from "@/types";
import { forecastDemand } from "@/lib/prediction/demandForecast";
import { forecastProviderSupply } from "@/lib/prediction/providerSupplyForecast";
import { forecastSlaRisk } from "@/lib/prediction/slaForecast";
import { calculateCategoryDemandTrend } from "@/lib/prediction/categoryDemandTrends";
import { seasonalDemandMultiplier } from "@/lib/prediction/seasonalDemandRules";
import {
  detectQueueAnomalies,
  detectPaymentAnomalies,
  detectProviderAnomalies,
  buildAnomalyReport,
  type Anomaly,
} from "@/lib/prediction/anomalyDetection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVICE_CATEGORIES: ServiceCategory[] = [
  "plumbing", "electrical", "hvac", "cleaning", "landscaping", "pest_control",
  "appliance_repair", "locksmith", "handyman", "painting", "roofing", "flooring",
  "carpentry", "moving", "pool_service", "garage_door", "windows", "other",
];

function isServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === "string" && SERVICE_CATEGORIES.includes(value as ServiceCategory);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");

  const seasonality = SERVICE_CATEGORIES.map((category) => ({
    category,
    multiplier: seasonalDemandMultiplier(category),
  }));

  return NextResponse.json({
    seasonality: {
      all: seasonality,
      ...(isServiceCategory(categoryParam)
        ? {
            category: categoryParam,
            multiplier: seasonalDemandMultiplier(categoryParam),
          }
        : {}),
    },
    supportedCategories: SERVICE_CATEGORIES,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  if (action === "forecast_demand") {
    const { serviceArea, category, trailingJobs, providerCount } = body as Record<string, unknown>;
    if (typeof serviceArea !== "string" || serviceArea.trim() === "") {
      return NextResponse.json({ error: "serviceArea required" }, { status: 400 });
    }
    if (!isServiceCategory(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${SERVICE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof trailingJobs !== "number" || typeof providerCount !== "number") {
      return NextResponse.json(
        { error: "trailingJobs and providerCount must be numbers" },
        { status: 400 }
      );
    }
    const forecast = forecastDemand({ serviceArea, category, trailingJobs, providerCount });
    return NextResponse.json({
      action: "forecast_demand",
      forecast,
      seasonalMultiplier: seasonalDemandMultiplier(category),
      success: true,
    });
  }

  if (action === "forecast_provider_supply") {
    const { expectedJobs, activeProviders, jobsPerProviderCapacity } = body as Record<string, unknown>;
    if (typeof expectedJobs !== "number" || typeof activeProviders !== "number") {
      return NextResponse.json(
        { error: "expectedJobs and activeProviders must be numbers" },
        { status: 400 }
      );
    }
    const forecast = forecastProviderSupply({
      expectedJobs,
      activeProviders,
      ...(typeof jobsPerProviderCapacity === "number"
        ? { jobsPerProviderCapacity }
        : {}),
    });
    return NextResponse.json({ action: "forecast_provider_supply", forecast, success: true });
  }

  if (action === "forecast_sla_risk") {
    const { openJobs, activeProviders, emergencyJobs, averageResponseMinutes } =
      body as Record<string, unknown>;
    if (
      typeof openJobs !== "number" ||
      typeof activeProviders !== "number" ||
      typeof emergencyJobs !== "number"
    ) {
      return NextResponse.json(
        { error: "openJobs, activeProviders, and emergencyJobs must be numbers" },
        { status: 400 }
      );
    }
    const forecast = forecastSlaRisk({
      openJobs,
      activeProviders,
      emergencyJobs,
      ...(typeof averageResponseMinutes === "number" ? { averageResponseMinutes } : {}),
    });
    return NextResponse.json({ action: "forecast_sla_risk", forecast, success: true });
  }

  if (action === "category_trend") {
    const { category, currentJobs, previousJobs } = body as Record<string, unknown>;
    if (!isServiceCategory(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${SERVICE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof currentJobs !== "number" || typeof previousJobs !== "number") {
      return NextResponse.json(
        { error: "currentJobs and previousJobs must be numbers" },
        { status: 400 }
      );
    }
    const trend = calculateCategoryDemandTrend(category, currentJobs, previousJobs);
    return NextResponse.json({ action: "category_trend", trend, success: true });
  }

  if (action === "detect_anomalies") {
    const { queue, payments, providers } = body as Record<string, unknown>;
    const collected: Anomaly[] = [];

    if (queue && typeof queue === "object") {
      const q = queue as Record<string, unknown>;
      collected.push(
        ...detectQueueAnomalies({
          pendingCount: num(q.pendingCount, 0),
          failedCount: num(q.failedCount, 0),
          processingCount: num(q.processingCount, 0),
          oldestPendingAgeMs:
            typeof q.oldestPendingAgeMs === "number" ? q.oldestPendingAgeMs : null,
          ...(typeof q.avgProcessingTimeMs === "number"
            ? { avgProcessingTimeMs: q.avgProcessingTimeMs }
            : {}),
        })
      );
    }

    if (payments && typeof payments === "object") {
      const p = payments as Record<string, unknown>;
      collected.push(
        ...detectPaymentAnomalies({
          failedPaymentsLast24h: num(p.failedPaymentsLast24h, 0),
          chargebacksLast7d: num(p.chargebacksLast7d, 0),
          pendingPayoutsCents: num(p.pendingPayoutsCents, 0),
          avgJobValueCents: num(p.avgJobValueCents, 0),
          refundRateLast30d: num(p.refundRateLast30d, 0),
        })
      );
    }

    if (providers && typeof providers === "object") {
      const pr = providers as Record<string, unknown>;
      collected.push(
        ...detectProviderAnomalies({
          noShowRateLast30d: num(pr.noShowRateLast30d, 0),
          disputeRateLast30d: num(pr.disputeRateLast30d, 0),
          avgAcceptanceRate: num(pr.avgAcceptanceRate, 0),
          activeProvidersCount: num(pr.activeProvidersCount, 0),
          unacceptedOffersLast24h: num(pr.unacceptedOffersLast24h, 0),
        })
      );
    }

    if (!queue && !payments && !providers) {
      return NextResponse.json(
        { error: "At least one of 'queue', 'payments', or 'providers' input objects required" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      action: "detect_anomalies",
      report: buildAnomalyReport(collected),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'forecast_demand', 'forecast_provider_supply', 'forecast_sla_risk', 'category_trend', or 'detect_anomalies'.`,
    },
    { status: 400 }
  );
}
