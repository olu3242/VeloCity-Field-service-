// GET  /api/admin/event-intelligence — anomalies by tenant, top anomalous, high-impact, duplicate patterns
// POST /api/admin/event-intelligence — score_anomaly | classify_impact | record_occurrence | register_impact
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  scoreEventAnomaly,
  getAnomaliesByTenant,
  getTopAnomalousEvents,
} from "@/lib/event-intelligence/anomaly-scorer";
import {
  classifyImpact,
  getHighImpactEvents,
  registerImpact,
  type EventImpact,
} from "@/lib/event-intelligence/impact-classifier";
import {
  recordEventOccurrence,
  isDuplicateSurge,
  getDuplicatePatterns,
} from "@/lib/event-intelligence/duplicate-detector";

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  const anomaliesByTenant = getAnomaliesByTenant(tenantId);
  const topAnomalousEvents = getTopAnomalousEvents(limit);
  const highImpactEvents = getHighImpactEvents();
  const duplicatePatterns = getDuplicatePatterns();

  return NextResponse.json({
    tenantId,
    anomalies: {
      byTenant: anomaliesByTenant,
      top: topAnomalousEvents,
    },
    impact: {
      highImpactEvents,
      count: highImpactEvents.length,
    },
    duplicates: {
      patterns: duplicatePatterns,
      count: duplicatePatterns.length,
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

  if (action === "score_anomaly") {
    const { eventType, frequency, expectedFrequency, payloadSize } =
      body as Record<string, unknown>;

    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    const anomaly = scoreEventAnomaly(eventType, tenantId, {
      ...(typeof frequency === "number" ? { frequency } : {}),
      ...(typeof expectedFrequency === "number" ? { expectedFrequency } : {}),
      ...(typeof payloadSize === "number" ? { payloadSize } : {}),
    });
    return NextResponse.json({ action: "score_anomaly", anomaly, flagged: anomaly !== null, success: true });
  }

  if (action === "classify_impact") {
    const { eventType } = body as Record<string, unknown>;

    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    const impact = classifyImpact(eventType);
    return NextResponse.json({ action: "classify_impact", impact, success: true });
  }

  if (action === "record_occurrence") {
    const { eventType, threshold } = body as Record<string, unknown>;

    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    recordEventOccurrence(eventType, tenantId);
    const surge = isDuplicateSurge(
      eventType,
      tenantId,
      typeof threshold === "number" ? threshold : undefined
    );
    return NextResponse.json({ action: "record_occurrence", eventType, isSurge: surge, success: true });
  }

  if (action === "register_impact") {
    const { eventType, impactLevel, affectedSystems, estimatedUsersAffected, requiresImmedateAction } =
      body as Record<string, unknown>;

    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!["low", "medium", "high", "critical"].includes(impactLevel as string)) {
      return NextResponse.json(
        { error: "impactLevel must be one of: low, medium, high, critical" },
        { status: 400 }
      );
    }

    const impact: EventImpact = {
      eventType,
      impactLevel: impactLevel as EventImpact["impactLevel"],
      affectedSystems: Array.isArray(affectedSystems) ? (affectedSystems as string[]) : [],
      estimatedUsersAffected: typeof estimatedUsersAffected === "number" ? estimatedUsersAffected : 0,
      requiresImmedateAction: requiresImmedateAction === true,
    };
    registerImpact(impact);
    return NextResponse.json({ action: "register_impact", impact, success: true }, { status: 201 });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'score_anomaly', 'classify_impact', 'record_occurrence', or 'register_impact'.` },
    { status: 400 }
  );
}
