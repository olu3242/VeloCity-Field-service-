// GET  /api/admin/treasury — tenant balance, ledger history, pending payouts, payout stats, FX rates
// POST /api/admin/treasury — record_entry | schedule_payout | approve_payout | process_payout
//                            | fail_payout | register_fx_rate | convert
// Admin-only; strictly tenant-scoped — ledger and payout reads/writes are bound to the caller's tenant.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordEntry,
  getBalance,
  getLedgerHistory,
  getGlobalBalance,
  type LedgerEntry,
} from "@/lib/treasury/treasury-ledger";
import {
  schedulePayout,
  approvePayout,
  processPayout,
  failPayout,
  getPendingPayouts,
  getPayoutStats,
} from "@/lib/treasury/payout-orchestrator";
import {
  registerFXRate,
  convert,
  getRate,
  getAllRates,
} from "@/lib/treasury/fx-router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ENTRY_TYPES: LedgerEntry["entryType"][] = [
  "credit", "debit", "hold", "release", "commission", "payout",
];

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const fromCurrency = url.searchParams.get("fromCurrency");
  const toCurrency = url.searchParams.get("toCurrency");
  const isSuperAdmin = auth.profile.role === "super_admin";

  return NextResponse.json({
    ledger: {
      balance: getBalance(tenantId),
      history: getLedgerHistory(tenantId, limit),
      // Global balance is a cross-tenant aggregate — super_admin only.
      ...(isSuperAdmin ? { globalBalance: getGlobalBalance() } : {}),
    },
    payouts: {
      pending: getPendingPayouts(tenantId),
      stats: getPayoutStats(tenantId),
    },
    fx: {
      rates: getAllRates(),
      ...(fromCurrency && toCurrency
        ? { rate: getRate(fromCurrency, toCurrency) ?? null }
        : {}),
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

  if (action === "record_entry") {
    const { entryType, amount, description, currency, referenceId } = body as Record<string, unknown>;
    if (!VALID_ENTRY_TYPES.includes(entryType as LedgerEntry["entryType"])) {
      return NextResponse.json(
        { error: `entryType must be one of: ${VALID_ENTRY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    const entry = recordEntry(
      tenantId,
      entryType as LedgerEntry["entryType"],
      amount,
      description,
      typeof currency === "string" ? currency : "USD",
      typeof referenceId === "string" ? referenceId : undefined
    );
    return NextResponse.json({ action: "record_entry", entry, success: true }, { status: 201 });
  }

  if (action === "schedule_payout") {
    const { providerId, amount, currency, scheduledAt } = body as Record<string, unknown>;
    if (typeof providerId !== "string" || providerId.trim() === "") {
      return NextResponse.json({ error: "providerId required" }, { status: 400 });
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    try {
      const payout = schedulePayout(
        tenantId,
        providerId,
        amount,
        typeof currency === "string" ? currency : "USD",
        typeof scheduledAt === "string" ? scheduledAt : undefined
      );
      return NextResponse.json({ action: "schedule_payout", payout, success: true }, { status: 201 });
    } catch (err) {
      // Runtime pause is a governance stop — surface it as 409, not 500.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Payout scheduling failed" },
        { status: 409 }
      );
    }
  }

  if (action === "approve_payout" || action === "process_payout" || action === "fail_payout") {
    const { id, reason } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Tenant guard — a payout may only be mutated by an admin of its owning tenant.
    const owned = getPendingPayouts(tenantId).some((p) => p.id === id);
    if (!owned) {
      return NextResponse.json(
        { error: "Payout not found for this tenant or not in a mutable state" },
        { status: 404 }
      );
    }

    if (action === "approve_payout") {
      approvePayout(id);
    } else if (action === "process_payout") {
      processPayout(id);
    } else {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required to fail a payout" }, { status: 400 });
      }
      failPayout(id, reason);
    }

    return NextResponse.json({ action, id, stats: getPayoutStats(tenantId), success: true });
  }

  if (action === "register_fx_rate") {
    const { fromCurrency, toCurrency, rate, spread } = body as Record<string, unknown>;
    if (typeof fromCurrency !== "string" || typeof toCurrency !== "string") {
      return NextResponse.json({ error: "fromCurrency and toCurrency required" }, { status: 400 });
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "rate must be a positive number" }, { status: 400 });
    }
    if (typeof spread !== "number" || !Number.isFinite(spread) || spread < 0) {
      return NextResponse.json({ error: "spread must be a non-negative number" }, { status: 400 });
    }
    const fx = registerFXRate(fromCurrency, toCurrency, rate, spread);
    return NextResponse.json({ action: "register_fx_rate", fx, success: true }, { status: 201 });
  }

  if (action === "convert") {
    const { amount, fromCurrency, toCurrency } = body as Record<string, unknown>;
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
    }
    if (typeof fromCurrency !== "string" || typeof toCurrency !== "string") {
      return NextResponse.json({ error: "fromCurrency and toCurrency required" }, { status: 400 });
    }
    const conversion = convert(amount, fromCurrency, toCurrency);
    return NextResponse.json({ action: "convert", conversion, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_entry', 'schedule_payout', 'approve_payout', 'process_payout', 'fail_payout', 'register_fx_rate', or 'convert'.`,
    },
    { status: 400 }
  );
}
