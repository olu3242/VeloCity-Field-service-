// GET  /api/admin/relationship-economy — full RIEF dashboard: scores, community, franchise rankings, analytics
// POST /api/admin/relationship-economy — create_community_program | record_contribution | update_franchise_score | get_franchise_leaderboard | add_participant

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  createProgram, toggleProgram, recordContribution, addParticipant,
  getPrograms, getProgramById, getContributions, getCommunityStats,
  type CommunityProgramType, type ContributorType,
} from "@/lib/relationship/community-impact";
import {
  updateRelationshipScore, getTopParticipants, getScoreDistribution,
  type ParticipantType,
} from "@/lib/relationship/relationship-score";
import { getRecognitionSummary } from "@/lib/relationship/recognition-engine";
import { getLoyaltyStats } from "@/lib/relationship/loyalty-engine";
import { getReferralStats } from "@/lib/relationship/referral-engine";
import { getWalletStats } from "@/lib/relationship/reward-wallet";
import { computeAndRecordSnapshot, getLatestSnapshot } from "@/lib/relationship/relationship-analytics";
import { getCurrencyStats } from "@/lib/relationship/reward-currency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PROGRAM_TYPES: CommunityProgramType[] = [
  "veteran_assistance", "senior_support", "community_volunteering",
  "disaster_recovery", "nonprofit_partnership",
];
const VALID_CONTRIBUTOR_TYPES: ContributorType[] = ["provider", "franchise", "customer"];

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
  const programId = url.searchParams.get("programId");
  const franchiseLimit = Math.min(50, parseInt(url.searchParams.get("franchiseLimit") ?? "20", 10));
  const providerLimit = Math.min(50, parseInt(url.searchParams.get("providerLimit") ?? "20", 10));

  if (programId) {
    const program = getProgramById(programId);
    if (!program || program.tenantId !== tenantId) return NextResponse.json({ error: "Program not found" }, { status: 404 });
    const contributions = getContributions(tenantId, programId, 50);
    return NextResponse.json({ program, contributions, generatedAt: new Date().toISOString() });
  }

  // Full relationship economy dashboard
  const snapshot = getLatestSnapshot(tenantId) ?? computeAndRecordSnapshot(tenantId);

  return NextResponse.json({
    overview: {
      recognition: getRecognitionSummary(tenantId),
      loyalty: getLoyaltyStats(tenantId),
      referrals: getReferralStats(tenantId),
      wallets: getWalletStats(tenantId),
      community: getCommunityStats(tenantId),
      currency: getCurrencyStats(tenantId),
    },
    analytics: snapshot,
    leaderboards: {
      topFranchises: getTopParticipants(tenantId, "franchise", franchiseLimit),
      topProviders: getTopParticipants(tenantId, "provider", providerLimit),
      topCustomers: getTopParticipants(tenantId, "customer", 10),
      topCommercial: getTopParticipants(tenantId, "commercial", 10),
    },
    scoreDistribution: {
      franchise: getScoreDistribution(tenantId, "franchise"),
      provider: getScoreDistribution(tenantId, "provider"),
      customer: getScoreDistribution(tenantId, "customer"),
    },
    communityPrograms: getPrograms(tenantId),
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

  if (action === "create_community_program") {
    const { programType, name, description } = body as Record<string, unknown>;
    if (!VALID_PROGRAM_TYPES.includes(programType as CommunityProgramType)) return NextResponse.json({ error: `programType must be one of: ${VALID_PROGRAM_TYPES.join(", ")}` }, { status: 400 });
    if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    const program = createProgram({
      tenantId,
      programType: programType as CommunityProgramType,
      name,
      description: typeof description === "string" ? description : "",
    });
    return NextResponse.json({ action, program, success: true }, { status: 201 });
  }

  if (action === "toggle_program") {
    const { programId, isActive } = body as Record<string, unknown>;
    if (typeof programId !== "string") return NextResponse.json({ error: "programId required" }, { status: 400 });
    const program = toggleProgram(programId, isActive === true);
    if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 });
    return NextResponse.json({ action, program, success: true });
  }

  if (action === "record_contribution") {
    const { programId, contributorId, contributorType, jobId, valueUsd, description } = body as Record<string, unknown>;
    if (typeof programId !== "string" || typeof contributorId !== "string") return NextResponse.json({ error: "programId and contributorId required" }, { status: 400 });
    if (!VALID_CONTRIBUTOR_TYPES.includes(contributorType as ContributorType)) return NextResponse.json({ error: `contributorType must be one of: ${VALID_CONTRIBUTOR_TYPES.join(", ")}` }, { status: 400 });
    if (typeof valueUsd !== "number" || valueUsd < 0) return NextResponse.json({ error: "valueUsd must be non-negative" }, { status: 400 });
    const contribution = recordContribution({
      tenantId, programId, contributorId,
      contributorType: contributorType as ContributorType,
      jobId: typeof jobId === "string" ? jobId : undefined,
      valueUsd,
      description: typeof description === "string" ? description : "Community contribution",
    });
    if (!contribution) return NextResponse.json({ error: "Program not found or inactive" }, { status: 422 });
    return NextResponse.json({ action, contribution, success: true }, { status: 201 });
  }

  if (action === "add_participant") {
    const { programId } = body as Record<string, unknown>;
    if (typeof programId !== "string") return NextResponse.json({ error: "programId required" }, { status: 400 });
    addParticipant(programId);
    return NextResponse.json({ action, programId, success: true });
  }

  if (action === "update_franchise_score") {
    const { franchiseId, componentUpdates } = body as Record<string, unknown>;
    if (typeof franchiseId !== "string") return NextResponse.json({ error: "franchiseId required" }, { status: 400 });
    if (!componentUpdates || typeof componentUpdates !== "object") return NextResponse.json({ error: "componentUpdates required" }, { status: 400 });
    const score = updateRelationshipScore({
      participantId: franchiseId,
      participantType: "franchise" as ParticipantType,
      tenantId,
      componentUpdates: componentUpdates as Record<string, number>,
    });
    return NextResponse.json({ action, score, success: true }, { status: 201 });
  }

  if (action === "refresh_analytics") {
    const snapshot = computeAndRecordSnapshot(tenantId);
    return NextResponse.json({ action, snapshot, success: true }, { status: 201 });
  }

  if (action === "get_franchise_leaderboard") {
    const { limit } = body as Record<string, unknown>;
    const n = typeof limit === "number" ? Math.min(50, limit) : 20;
    return NextResponse.json({ action, leaderboard: getTopParticipants(tenantId, "franchise", n), success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'create_community_program', 'toggle_program', 'record_contribution', 'add_participant', 'update_franchise_score', 'refresh_analytics', or 'get_franchise_leaderboard'.` }, { status: 400 });
}
