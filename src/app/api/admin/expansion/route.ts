// GET  /api/admin/expansion — market demand, supply, and opportunity intelligence for a territory
// POST /api/admin/expansion — analyze_supply_gap | city_readiness | launch_playbook
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  computeMarketDemand,
  computeMarketSupply,
  computeMarketOpportunities,
  calculateCityReadinessScore,
  analyzeSupplyGap,
  generateLaunchPlaybook,
} from "@/lib/expansion";
import type { ServiceCategory } from "@/types";

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
  const territoryId = url.searchParams.get("territoryId") ?? tenantId;

  const [demand, supply, opportunities] = await Promise.all([
    computeMarketDemand(territoryId),
    computeMarketSupply(territoryId),
    computeMarketOpportunities(territoryId),
  ]);

  return NextResponse.json({
    tenantId,
    territoryId,
    demand,
    supply,
    opportunities,
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

  if (action === "analyze_supply_gap") {
    const { category, expectedJobs, activeProviders } = body as Record<string, unknown>;
    if (typeof category !== "string" || typeof expectedJobs !== "number" || typeof activeProviders !== "number") {
      return NextResponse.json(
        { error: "category, expectedJobs, and activeProviders required" },
        { status: 400 }
      );
    }
    const result = analyzeSupplyGap({
      category: category as ServiceCategory,
      expectedJobs,
      activeProviders,
    });
    return NextResponse.json({ action: "analyze_supply_gap", result, success: true });
  }

  if (action === "city_readiness") {
    const { demandIndex, providerCount, activeCustomers, monthlyRevenueCents } = body as Record<string, unknown>;
    if (
      typeof demandIndex !== "number" ||
      typeof providerCount !== "number" ||
      typeof activeCustomers !== "number" ||
      typeof monthlyRevenueCents !== "number"
    ) {
      return NextResponse.json(
        { error: "demandIndex, providerCount, activeCustomers, and monthlyRevenueCents required" },
        { status: 400 }
      );
    }
    const result = calculateCityReadinessScore({ demandIndex, providerCount, activeCustomers, monthlyRevenueCents });
    return NextResponse.json({ action: "city_readiness", result, success: true });
  }

  if (action === "launch_playbook") {
    const { city, zipCodes, categories, providersNeeded } = body as Record<string, unknown>;
    if (typeof city !== "string" || !Array.isArray(zipCodes) || !Array.isArray(categories)) {
      return NextResponse.json(
        { error: "city, zipCodes[], and categories[] required" },
        { status: 400 }
      );
    }
    const result = generateLaunchPlaybook({
      city,
      zipCodes: zipCodes as string[],
      categories: categories as ServiceCategory[],
      providersNeeded: typeof providersNeeded === "number" ? providersNeeded : 10,
    });
    return NextResponse.json({ action: "launch_playbook", result, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'analyze_supply_gap', 'city_readiness', or 'launch_playbook'.` },
    { status: 400 }
  );
}
