// GET  /api/admin/risk — high-risk entities, fraud scores, risk heatmap, payout risk
// POST /api/admin/risk — score_fraud | score_payout_risk
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreFraud,
  getHighRiskEntities,
  getFraudScore,
  type FraudSignal,
} from "@/lib/risk/fraud-scorer";
import {
  getHeatmap,
  getTopRiskDimensions,
} from "@/lib/risk/risk-heatmap";
import {
  scorePayoutRisk,
  type PayoutRiskInput,
} from "@/lib/risk/payout-risk-scorer";

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

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const threshold = parseInt(url.searchParams.get("threshold") ?? "40", 10);
  const heatmapLimit = Math.min(parseInt(url.searchParams.get("heatmapLimit") ?? "20", 10), 100);
  const entityId = url.searchParams.get("entityId");

  const highRiskEntities = getHighRiskEntities(threshold);
  const topRiskDimensions = getTopRiskDimensions(heatmapLimit);
  const heatmap = getHeatmap("score").slice(0, heatmapLimit);
  const fraudSummary = {
    total: highRiskEntities.length,
    fraud: highRiskEntities.filter((e) => e.verdict === "fraud").length,
    suspicious: highRiskEntities.filter((e) => e.verdict === "suspicious").length,
    byEntityType: highRiskEntities.reduce<Record<string, number>>((acc, e) => {
      acc[e.entityType] = (acc[e.entityType] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const specificScore = entityId ? getFraudScore(entityId) ?? null : null;

  return NextResponse.json({
    tenantId,
    fraud: {
      highRiskEntities,
      summary: fraudSummary,
      ...(specificScore && { entityScore: specificScore }),
    },
    heatmap: {
      top: topRiskDimensions,
      all: heatmap,
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

  if (action === "score_fraud") {
    const { entityId, entityType, signals } = body as Record<string, unknown>;

    if (typeof entityId !== "string") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }
    if (!["provider", "customer", "tenant"].includes(entityType as string)) {
      return NextResponse.json(
        { error: "entityType must be provider | customer | tenant" },
        { status: 400 }
      );
    }
    if (!Array.isArray(signals)) {
      return NextResponse.json({ error: "signals array required" }, { status: 400 });
    }

    const result = scoreFraud(
      entityId,
      entityType as "provider" | "customer" | "tenant",
      signals as FraudSignal[]
    );
    return NextResponse.json({ action: "score_fraud", result, success: true });
  }

  if (action === "score_payout_risk") {
    const { providerId, amountUsd, daysSinceLastPayout, priorDisputeCount, verificationStatus } =
      body as Record<string, unknown>;

    if (typeof providerId !== "string" || typeof amountUsd !== "number") {
      return NextResponse.json(
        { error: "providerId and amountUsd required" },
        { status: 400 }
      );
    }

    const input: PayoutRiskInput = {
      tenantId,
      providerId,
      amountUsd,
      daysSinceLastPayout: typeof daysSinceLastPayout === "number" ? daysSinceLastPayout : undefined,
      priorDisputeCount: typeof priorDisputeCount === "number" ? priorDisputeCount : undefined,
      verificationStatus: ["verified", "pending", "unverified"].includes(verificationStatus as string)
        ? (verificationStatus as PayoutRiskInput["verificationStatus"])
        : "pending",
    };

    const result = scorePayoutRisk(input);
    return NextResponse.json({ action: "score_payout_risk", result, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'score_fraud' or 'score_payout_risk'.` },
    { status: 400 }
  );
}
