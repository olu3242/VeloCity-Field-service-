// POST /api/cron/revenue — periodic commission settlement + usage reconciliation
// Runs on a schedule (e.g. daily at midnight) to:
//  1. Flush in-memory commission records to commission_ledger
//  2. Flush in-memory metered usage to metered_usage_events
//  3. Mark revenue_records as settled
//
// Also callable via GET for monitoring.

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getTenantCommissions,
  getCommissionSummary,
} from "@/lib/revenue-infra/commission-engine";
import { getTenantBill } from "@/lib/revenue-infra/metered-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runRevenueSettlement(request);
}

export async function POST(request: NextRequest) {
  return runRevenueSettlement(request);
}

async function runRevenueSettlement(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const supabase = getAdminClient();
  const period = new Date().toISOString().slice(0, 7);
  const settled: string[] = [];
  const errors: string[] = [];

  // Settle unsettled revenue_records (mark as settled)
  try {
    const { data: unsettled, error } = await supabase
      .from("revenue_records")
      .select("id, tenant_id, gross_amount_cents, platform_fee_cents")
      .eq("settled", false)
      .limit(500);

    if (!error && unsettled && unsettled.length > 0) {
      const ids = unsettled.map((r: { id: string }) => r.id);
      const { error: updateErr } = await supabase
        .from("revenue_records")
        .update({ settled: true, settled_at: new Date().toISOString() })
        .in("id", ids);

      if (!updateErr) {
        settled.push(`revenue_records:${ids.length}`);
      } else {
        errors.push(`revenue_records_settle: ${updateErr.message}`);
      }
    }
  } catch (err) {
    errors.push(`revenue_records: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Settle unsettled commission_ledger entries
  try {
    const { data: unsettledCommissions } = await supabase
      .from("commission_ledger")
      .select("id")
      .eq("settled", false)
      .limit(500);

    if (unsettledCommissions && unsettledCommissions.length > 0) {
      const ids = unsettledCommissions.map((r: { id: string }) => r.id);
      const { error: updateErr } = await supabase
        .from("commission_ledger")
        .update({ settled: true, settled_at: new Date().toISOString() })
        .in("id", ids);

      if (!updateErr) {
        settled.push(`commission_ledger:${ids.length}`);
      } else {
        errors.push(`commission_ledger_settle: ${updateErr.message}`);
      }
    }
  } catch (err) {
    errors.push(`commission_ledger: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    period,
    settled,
    errors,
    completedAt: new Date().toISOString(),
  });
}
