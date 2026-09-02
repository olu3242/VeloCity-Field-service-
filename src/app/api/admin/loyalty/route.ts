// GET  /api/admin/loyalty — loyalty stats, tier distribution, leaderboard
// POST /api/admin/loyalty — award_points | redeem_points | get_account | check_upgrade | configure_currency | add_earning_rule | add_catalog_item

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  awardPoints, redeemPoints, getLoyaltyAccount,
  getLoyaltyTransactions, getRedemptions, checkUpgrade, getLoyaltyStats,
  type LoyaltyEventType, type RedemptionType,
} from "@/lib/relationship/loyalty-engine";
import {
  configureCurrency, addEarningRule, addRedemptionItem,
  getCurrency, getEarningRules, getRedemptionCatalog, getCurrencyStats, pointsToUsd,
} from "@/lib/relationship/reward-currency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_EVENT_TYPES: LoyaltyEventType[] = [
  "first_booking", "repeat_booking", "annual_loyalty", "membership_renewal",
  "review_submitted", "referral_made", "early_payment", "commercial_account",
];
const VALID_REDEMPTION_TYPES: RedemptionType[] = [
  "discount", "service_credit", "membership_upgrade", "priority_scheduling",
  "emergency_credit", "marketplace_offer", "partner_reward",
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
  const customerId = url.searchParams.get("customerId");
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));

  if (customerId) {
    const account = getLoyaltyAccount(customerId, tenantId);
    const transactions = getLoyaltyTransactions(customerId, tenantId, limit);
    const redemptions = getRedemptions(customerId, tenantId, 20);
    const upgrade = checkUpgrade(customerId, tenantId);
    const balanceUsd = pointsToUsd(tenantId, account.pointsBalance);
    return NextResponse.json({ account, transactions, redemptions, upgrade, balanceUsd, generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({
    stats: getLoyaltyStats(tenantId),
    currency: getCurrency(tenantId),
    earningRules: getEarningRules(tenantId),
    catalog: getRedemptionCatalog(tenantId),
    currencyStats: getCurrencyStats(tenantId),
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

  if (action === "award_points") {
    const { customerId, eventType, pointsOverride, jobId, referralId, description } = body as Record<string, unknown>;
    if (typeof customerId !== "string") return NextResponse.json({ error: "customerId required" }, { status: 400 });
    if (!VALID_EVENT_TYPES.includes(eventType as LoyaltyEventType)) return NextResponse.json({ error: `eventType must be one of: ${VALID_EVENT_TYPES.join(", ")}` }, { status: 400 });
    const tx = awardPoints({
      tenantId, customerId,
      eventType: eventType as LoyaltyEventType,
      pointsOverride: typeof pointsOverride === "number" ? pointsOverride : undefined,
      jobId: typeof jobId === "string" ? jobId : undefined,
      referralId: typeof referralId === "string" ? referralId : undefined,
      description: typeof description === "string" ? description : undefined,
    });
    return NextResponse.json({ action, transaction: tx, account: getLoyaltyAccount(customerId, tenantId), success: true }, { status: 201 });
  }

  if (action === "redeem_points") {
    const { customerId, type, pointsToRedeem, valueUsd, description } = body as Record<string, unknown>;
    if (typeof customerId !== "string") return NextResponse.json({ error: "customerId required" }, { status: 400 });
    if (!VALID_REDEMPTION_TYPES.includes(type as RedemptionType)) return NextResponse.json({ error: `type must be one of: ${VALID_REDEMPTION_TYPES.join(", ")}` }, { status: 400 });
    if (typeof pointsToRedeem !== "number" || pointsToRedeem <= 0) return NextResponse.json({ error: "pointsToRedeem must be a positive number" }, { status: 400 });
    const record = redeemPoints({
      tenantId, customerId,
      type: type as RedemptionType,
      pointsToRedeem,
      valueUsd: typeof valueUsd === "number" ? valueUsd : pointsToUsd(tenantId, pointsToRedeem),
      description: typeof description === "string" ? description : `Redeemed for ${type}`,
    });
    if (!record) return NextResponse.json({ error: "Insufficient points balance" }, { status: 422 });
    return NextResponse.json({ action, redemption: record, account: getLoyaltyAccount(customerId, tenantId), success: true }, { status: 201 });
  }

  if (action === "get_account") {
    const { customerId } = body as Record<string, unknown>;
    if (typeof customerId !== "string") return NextResponse.json({ error: "customerId required" }, { status: 400 });
    return NextResponse.json({ action, account: getLoyaltyAccount(customerId, tenantId), upgrade: checkUpgrade(customerId, tenantId), success: true });
  }

  if (action === "configure_currency") {
    const { name, symbol, conversionValueUsd, expirationDays } = body as Record<string, unknown>;
    if (typeof name !== "string" || typeof symbol !== "string") return NextResponse.json({ error: "name and symbol required" }, { status: 400 });
    if (typeof conversionValueUsd !== "number" || conversionValueUsd <= 0) return NextResponse.json({ error: "conversionValueUsd must be positive" }, { status: 400 });
    const currency = configureCurrency({
      tenantId, name, symbol, conversionValueUsd,
      expirationDays: typeof expirationDays === "number" ? expirationDays : undefined,
    });
    return NextResponse.json({ action, currency, success: true }, { status: 201 });
  }

  if (action === "add_earning_rule") {
    const { eventType, pointsAwarded, multiplier, conditions } = body as Record<string, unknown>;
    if (typeof eventType !== "string") return NextResponse.json({ error: "eventType required" }, { status: 400 });
    if (typeof pointsAwarded !== "number" || pointsAwarded <= 0) return NextResponse.json({ error: "pointsAwarded must be positive" }, { status: 400 });
    const rule = addEarningRule({
      tenantId, eventType: eventType as LoyaltyEventType,
      pointsAwarded,
      multiplier: typeof multiplier === "number" ? multiplier : 1,
      conditions: typeof conditions === "string" ? conditions : undefined,
    });
    return NextResponse.json({ action, rule, success: true }, { status: 201 });
  }

  if (action === "add_catalog_item") {
    const { name, description, pointsCost, valueUsd, type } = body as Record<string, unknown>;
    if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!VALID_REDEMPTION_TYPES.includes(type as RedemptionType)) return NextResponse.json({ error: `type must be one of: ${VALID_REDEMPTION_TYPES.join(", ")}` }, { status: 400 });
    if (typeof pointsCost !== "number" || pointsCost <= 0) return NextResponse.json({ error: "pointsCost must be positive" }, { status: 400 });
    const item = addRedemptionItem({
      tenantId, name,
      description: typeof description === "string" ? description : "",
      pointsCost,
      valueUsd: typeof valueUsd === "number" ? valueUsd : 0,
      type: type as RedemptionType,
    });
    return NextResponse.json({ action, item, success: true }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'award_points', 'redeem_points', 'get_account', 'configure_currency', 'add_earning_rule', or 'add_catalog_item'.` }, { status: 400 });
}
