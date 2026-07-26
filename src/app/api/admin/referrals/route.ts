// GET  /api/admin/referrals — referral stats, top referrers, conversion funnel
// POST /api/admin/referrals — create_referral | advance_status | issue_reward | expire_referral | get_referral

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  createReferral, advanceReferralStatus, issueReferralReward, expireReferral,
  getReferralById, getReferralsByReferrer, getReferralStats, getTopReferrers,
  type ReferralSourceType, type ReferralStatus,
} from "@/lib/relationship/referral-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SOURCE_TYPES: ReferralSourceType[] = ["customer", "provider", "franchisee", "commercial_client", "partner"];
const VALID_STATUSES: ReferralStatus[] = ["invited", "registered", "verified", "first_booking", "completed", "rewarded", "expired"];

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
  const referrerId = url.searchParams.get("referrerId");
  const referralId = url.searchParams.get("referralId");
  const topLimit = Math.min(50, parseInt(url.searchParams.get("topLimit") ?? "10", 10));

  if (referralId) {
    const referral = getReferralById(referralId);
    if (!referral || referral.tenantId !== tenantId) return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    return NextResponse.json({ referral, generatedAt: new Date().toISOString() });
  }

  if (referrerId) {
    return NextResponse.json({ referrals: getReferralsByReferrer(referrerId, tenantId), generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({
    stats: getReferralStats(tenantId),
    topReferrers: getTopReferrers(tenantId, topLimit),
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

  if (action === "create_referral") {
    const { referrerId, referrerType, refereeEmail, refereeId } = body as Record<string, unknown>;
    if (typeof referrerId !== "string") return NextResponse.json({ error: "referrerId required" }, { status: 400 });
    if (!VALID_SOURCE_TYPES.includes(referrerType as ReferralSourceType)) return NextResponse.json({ error: `referrerType must be one of: ${VALID_SOURCE_TYPES.join(", ")}` }, { status: 400 });
    const record = createReferral({
      tenantId, referrerId,
      referrerType: referrerType as ReferralSourceType,
      refereeEmail: typeof refereeEmail === "string" ? refereeEmail : undefined,
      refereeId: typeof refereeId === "string" ? refereeId : undefined,
    });
    return NextResponse.json({ action, referral: record, success: true }, { status: 201 });
  }

  if (action === "advance_status") {
    const { referralId, status, refereeId } = body as Record<string, unknown>;
    if (typeof referralId !== "string") return NextResponse.json({ error: "referralId required" }, { status: 400 });
    if (!VALID_STATUSES.includes(status as ReferralStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    const record = advanceReferralStatus(referralId, status as ReferralStatus, typeof refereeId === "string" ? refereeId : undefined);
    if (!record) return NextResponse.json({ error: "Referral not found or invalid status transition" }, { status: 422 });
    return NextResponse.json({ action, referral: record, success: true });
  }

  if (action === "issue_reward") {
    const { referralId, amount } = body as Record<string, unknown>;
    if (typeof referralId !== "string") return NextResponse.json({ error: "referralId required" }, { status: 400 });
    if (typeof amount !== "number" || amount <= 0) return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    const record = issueReferralReward(referralId, amount);
    if (!record) return NextResponse.json({ error: "Referral not found or not in completed state" }, { status: 422 });
    return NextResponse.json({ action, referral: record, success: true });
  }

  if (action === "expire_referral") {
    const { referralId } = body as Record<string, unknown>;
    if (typeof referralId !== "string") return NextResponse.json({ error: "referralId required" }, { status: 400 });
    const record = expireReferral(referralId);
    if (!record) return NextResponse.json({ error: "Referral not found or cannot be expired" }, { status: 422 });
    return NextResponse.json({ action, referral: record, success: true });
  }

  if (action === "get_referral") {
    const { referralId } = body as Record<string, unknown>;
    if (typeof referralId !== "string") return NextResponse.json({ error: "referralId required" }, { status: 400 });
    const referral = getReferralById(referralId);
    if (!referral || referral.tenantId !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ action, referral, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'create_referral', 'advance_status', 'issue_reward', 'expire_referral', or 'get_referral'.` }, { status: 400 });
}
