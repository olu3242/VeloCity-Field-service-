// GET  /api/admin/rewards — wallet stats, recent transactions, top earners
// POST /api/admin/rewards — credit_wallet | record_payout | set_payout_policy | get_wallet | get_transactions

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  creditWallet, recordPayout, setPayoutPolicy,
  getWallet, getWalletTransactions, getWalletStats,
  type WalletTransactionType, type PayoutPolicy,
} from "@/lib/relationship/reward-wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TX_TYPES: WalletTransactionType[] = ["reward", "tip", "bonus", "incentive", "payout", "adjustment"];
const VALID_POLICIES: PayoutPolicy[] = ["immediate", "weekly", "biweekly", "monthly", "manual"];

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
  const providerId = url.searchParams.get("providerId");
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));

  if (providerId) {
    const wallet = getWallet(providerId, tenantId);
    const transactions = getWalletTransactions(providerId, tenantId, limit);
    return NextResponse.json({ wallet, transactions, generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({ stats: getWalletStats(tenantId), generatedAt: new Date().toISOString() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "credit_wallet") {
    const { providerId, type, amount, jobId, reviewId, description, totalJobsIncrement } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    if (!VALID_TX_TYPES.includes(type as WalletTransactionType)) return NextResponse.json({ error: `type must be one of: ${VALID_TX_TYPES.join(", ")}` }, { status: 400 });
    if (typeof amount !== "number" || amount <= 0) return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    const tx = creditWallet({
      tenantId, providerId,
      type: type as WalletTransactionType,
      amount,
      jobId: typeof jobId === "string" ? jobId : undefined,
      reviewId: typeof reviewId === "string" ? reviewId : undefined,
      description: typeof description === "string" ? description : `${type} credit`,
      totalJobsIncrement: totalJobsIncrement === true,
    });
    return NextResponse.json({ action, transaction: tx, wallet: getWallet(providerId, tenantId), success: true }, { status: 201 });
  }

  if (action === "record_payout") {
    const { providerId, amount, description } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    if (typeof amount !== "number" || amount <= 0) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    const tx = recordPayout({ tenantId, providerId, amount, description: typeof description === "string" ? description : "Payout" });
    return NextResponse.json({ action, transaction: tx, wallet: getWallet(providerId, tenantId), success: true });
  }

  if (action === "set_payout_policy") {
    const { providerId, policy } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    if (!VALID_POLICIES.includes(policy as PayoutPolicy)) return NextResponse.json({ error: `policy must be one of: ${VALID_POLICIES.join(", ")}` }, { status: 400 });
    setPayoutPolicy(tenantId, providerId, policy as PayoutPolicy);
    return NextResponse.json({ action, providerId, policy, success: true });
  }

  if (action === "get_wallet") {
    const { providerId } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    const wallet = getWallet(providerId, tenantId);
    const transactions = getWalletTransactions(providerId, tenantId, 20);
    return NextResponse.json({ action, wallet, recentTransactions: transactions, success: true });
  }

  if (action === "get_transactions") {
    const { providerId, limit } = body as Record<string, unknown>;
    if (typeof providerId !== "string") return NextResponse.json({ error: "providerId required" }, { status: 400 });
    const n = typeof limit === "number" ? Math.min(100, limit) : 50;
    return NextResponse.json({ action, transactions: getWalletTransactions(providerId, tenantId, n), success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'credit_wallet', 'record_payout', 'set_payout_policy', 'get_wallet', or 'get_transactions'.` }, { status: 400 });
}
