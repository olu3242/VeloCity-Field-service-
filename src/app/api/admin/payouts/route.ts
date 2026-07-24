// GET  /api/admin/payouts — payout ledger with filtering and summary
// POST /api/admin/payouts — hold or release a payout
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { holdPayout, releasePayout } from "@/lib/payments";

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
  const status = url.searchParams.get("status");
  const providerId = url.searchParams.get("providerId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  const supabase = getAdminClient();

  let query = supabase
    .from("payout_ledger")
    .select("id, job_id, provider_id, amount, currency, status, retry_count, metadata, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (providerId) query = query.eq("provider_id", providerId);

  const { data: payouts } = await query;

  // Status summary
  const summary: Record<string, { count: number; totalCents: number }> = {};
  for (const p of payouts ?? []) {
    const s = (p as { status: string; amount: number }).status;
    const amt = (p as { amount: number }).amount ?? 0;
    if (!summary[s]) summary[s] = { count: 0, totalCents: 0 };
    summary[s].count++;
    summary[s].totalCents += amt;
  }

  // Held payouts
  const held = (payouts ?? []).filter((p) => (p as { status: string }).status === "payout_hold");
  const pending = (payouts ?? []).filter((p) => (p as { status: string }).status === "payout_pending");
  const released = (payouts ?? []).filter((p) => (p as { status: string }).status === "payout_released");

  return NextResponse.json({
    tenantId,
    payouts: payouts ?? [],
    summary,
    counts: {
      total: payouts?.length ?? 0,
      held: held.length,
      pending: pending.length,
      released: released.length,
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

  const { action, payoutId, reason, amountCents, providerId } =
    body as Record<string, unknown>;

  if (typeof payoutId !== "string") {
    return NextResponse.json({ error: "payoutId required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: payout } = await supabase
    .from("payout_ledger")
    .select("id, amount, status, provider_id, tenant_id")
    .eq("id", payoutId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  const payoutRecord = payout as { id: string; amount: number; status: string; provider_id: string };
  const ctx = {
    tenantId,
    amountCents: typeof amountCents === "number" ? amountCents : payoutRecord.amount,
    providerId: typeof providerId === "string" ? providerId : payoutRecord.provider_id,
  };

  if (action === "hold") {
    const result = holdPayout(ctx, typeof reason === "string" ? reason : "Admin hold");

    const { error } = await supabase
      .from("payout_ledger")
      .update({
        status: result.status,
        metadata: { hold_reason: result.message, held_by: "admin", held_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutId)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "hold", payoutId, result });
  }

  if (action === "release") {
    const result = releasePayout({ ...ctx, jobStatus: "completed", hasOpenDispute: false });

    const { error } = await supabase
      .from("payout_ledger")
      .update({
        status: result.status,
        metadata: { released_by: "admin", released_at: new Date().toISOString(), platform_fee_cents: result.platformFeeCents },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutId)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "release", payoutId, result });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'hold' or 'release'.` }, { status: 400 });
}
