// GET  /api/admin/customer-success — CLV, NPS, churn risk, loyalty health, customer analytics
// POST /api/admin/customer-success — compute_analytics | compute_churn_risk | update_relationship_score | get_score

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  computeAndRecordSnapshot, getLatestSnapshot, getSnapshotTrend,
  computeChurnRisk, getLatestChurnReport,
  computeProviderExcellenceTrend, getProviderExcellenceTrends,
} from "@/lib/relationship/relationship-analytics";
import {
  updateRelationshipScore, getRelationshipScore,
  getTopParticipants, getScoreDistribution,
  type ParticipantType,
} from "@/lib/relationship/relationship-score";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PARTICIPANT_TYPES: ParticipantType[] = ["customer", "provider", "franchise", "commercial"];

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
  const participantId = url.searchParams.get("participantId");
  const participantType = url.searchParams.get("participantType") as ParticipantType | null;
  const snapshotLimit = Math.min(20, parseInt(url.searchParams.get("snapshotLimit") ?? "10", 10));
  const topLimit = Math.min(50, parseInt(url.searchParams.get("topLimit") ?? "20", 10));

  if (participantId && participantType) {
    if (!VALID_PARTICIPANT_TYPES.includes(participantType)) {
      return NextResponse.json({ error: `participantType must be one of: ${VALID_PARTICIPANT_TYPES.join(", ")}` }, { status: 400 });
    }
    const score = getRelationshipScore(participantId, participantType, tenantId);
    return NextResponse.json({ score, generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({
    latestSnapshot: getLatestSnapshot(tenantId),
    snapshotTrend: getSnapshotTrend(tenantId, snapshotLimit),
    churnRisk: getLatestChurnReport(tenantId),
    providerExcellence: getProviderExcellenceTrends(tenantId, 5),
    scoreDistribution: {
      customer: getScoreDistribution(tenantId, "customer"),
      provider: getScoreDistribution(tenantId, "provider"),
      franchise: getScoreDistribution(tenantId, "franchise"),
      commercial: getScoreDistribution(tenantId, "commercial"),
    },
    topCustomers: getTopParticipants(tenantId, "customer", topLimit),
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

  if (action === "compute_analytics") {
    const snapshot = computeAndRecordSnapshot(tenantId);
    return NextResponse.json({ action, snapshot, success: true }, { status: 201 });
  }

  if (action === "compute_churn_risk") {
    const report = computeChurnRisk(tenantId);
    return NextResponse.json({ action, report, success: true }, { status: 201 });
  }

  if (action === "compute_excellence_trend") {
    const trend = computeProviderExcellenceTrend(tenantId);
    return NextResponse.json({ action, trend, success: true }, { status: 201 });
  }

  if (action === "update_relationship_score") {
    const { participantId, participantType, componentUpdates } = body as Record<string, unknown>;
    if (typeof participantId !== "string") return NextResponse.json({ error: "participantId required" }, { status: 400 });
    if (!VALID_PARTICIPANT_TYPES.includes(participantType as ParticipantType)) return NextResponse.json({ error: `participantType must be one of: ${VALID_PARTICIPANT_TYPES.join(", ")}` }, { status: 400 });
    if (!componentUpdates || typeof componentUpdates !== "object") return NextResponse.json({ error: "componentUpdates object required" }, { status: 400 });
    const score = updateRelationshipScore({
      participantId,
      participantType: participantType as ParticipantType,
      tenantId,
      componentUpdates: componentUpdates as Record<string, number>,
    });
    return NextResponse.json({ action, score, success: true }, { status: 201 });
  }

  if (action === "get_score") {
    const { participantId, participantType } = body as Record<string, unknown>;
    if (typeof participantId !== "string") return NextResponse.json({ error: "participantId required" }, { status: 400 });
    if (!VALID_PARTICIPANT_TYPES.includes(participantType as ParticipantType)) return NextResponse.json({ error: `participantType must be one of: ${VALID_PARTICIPANT_TYPES.join(", ")}` }, { status: 400 });
    const score = getRelationshipScore(participantId, participantType as ParticipantType, tenantId);
    return NextResponse.json({ action, score, success: true });
  }

  if (action === "get_top_participants") {
    const { participantType, limit } = body as Record<string, unknown>;
    if (!VALID_PARTICIPANT_TYPES.includes(participantType as ParticipantType)) return NextResponse.json({ error: `participantType must be one of: ${VALID_PARTICIPANT_TYPES.join(", ")}` }, { status: 400 });
    const n = typeof limit === "number" ? Math.min(50, limit) : 20;
    return NextResponse.json({ action, participants: getTopParticipants(tenantId, participantType as ParticipantType, n), success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'compute_analytics', 'compute_churn_risk', 'compute_excellence_trend', 'update_relationship_score', 'get_score', or 'get_top_participants'.` }, { status: 400 });
}
