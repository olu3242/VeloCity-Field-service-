// GET  /api/admin/territory — territory intelligence: zones, demand signals, provider density
// POST /api/admin/territory — upsert_zone | record_signal | record_density
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  upsertZone, recordDemandSignal, recordDensitySnapshot,
  getZonesByTenant, getStrainingZones, getActiveSignals, getSignalsByZone,
  getLatestDensity, getTerritoryIntelligenceSummary,
  type DemandSignalType,
} from "@/lib/territory/territory-intelligence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SIGNAL_TYPES: DemandSignalType[] = [
  "high_demand_spike", "provider_shortage", "seasonal_pattern",
  "new_service_type", "competitor_entry", "churn_cluster",
];

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
  const zoneId = url.searchParams.get("zoneId");

  return NextResponse.json({
    summary: getTerritoryIntelligenceSummary(tenantId),
    zones: getZonesByTenant(tenantId),
    straining: getStrainingZones(tenantId),
    signals: getActiveSignals(tenantId),
    ...(zoneId ? {
      zoneSignals: getSignalsByZone(zoneId),
      density: getLatestDensity(zoneId) ?? null,
    } : {}),
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

  if (action === "upsert_zone") {
    const { id, name, region, coverageRadiusKm, activeProviders, pendingJobs, avgResponseTimeMin, demandScore, supplyScore } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof region !== "string") {
      return NextResponse.json({ error: "id, name, and region required" }, { status: 400 });
    }
    const zone = upsertZone({
      id,
      tenantId,
      name,
      region,
      coverageRadiusKm: typeof coverageRadiusKm === "number" ? coverageRadiusKm : 10,
      activeProviders: typeof activeProviders === "number" ? activeProviders : 0,
      pendingJobs: typeof pendingJobs === "number" ? pendingJobs : 0,
      avgResponseTimeMin: typeof avgResponseTimeMin === "number" ? avgResponseTimeMin : 30,
      demandScore: typeof demandScore === "number" ? Math.min(100, Math.max(0, demandScore)) : 50,
      supplyScore: typeof supplyScore === "number" ? Math.min(100, Math.max(0, supplyScore)) : 50,
    });
    return NextResponse.json({ action, zone, success: true }, { status: 201 });
  }

  if (action === "record_signal") {
    const { zoneId, signalType, intensity, detail, expiresAt } = body as Record<string, unknown>;
    if (typeof zoneId !== "string") return NextResponse.json({ error: "zoneId required" }, { status: 400 });
    if (!VALID_SIGNAL_TYPES.includes(signalType as DemandSignalType)) {
      return NextResponse.json({ error: `signalType must be one of: ${VALID_SIGNAL_TYPES.join(", ")}` }, { status: 400 });
    }
    const signal = recordDemandSignal({
      tenantId,
      zoneId,
      signalType: signalType as DemandSignalType,
      intensity: typeof intensity === "number" ? Math.min(1, Math.max(0, intensity)) : 0.5,
      detail: typeof detail === "string" ? detail : "",
      expiresAt: typeof expiresAt === "string" ? expiresAt : undefined,
    });
    return NextResponse.json({ action, signal, success: true }, { status: 201 });
  }

  if (action === "record_density") {
    const { zoneId, totalProviders, activeProviders, avgRating, densityPerSqKm } = body as Record<string, unknown>;
    if (typeof zoneId !== "string") return NextResponse.json({ error: "zoneId required" }, { status: 400 });
    const snapshot = recordDensitySnapshot({
      zoneId,
      tenantId,
      totalProviders: typeof totalProviders === "number" ? totalProviders : 0,
      activeProviders: typeof activeProviders === "number" ? activeProviders : 0,
      avgRating: typeof avgRating === "number" ? avgRating : 0,
      densityPerSqKm: typeof densityPerSqKm === "number" ? densityPerSqKm : 0,
    });
    return NextResponse.json({ action, snapshot, success: true }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'upsert_zone', 'record_signal', or 'record_density'.` }, { status: 400 });
}
