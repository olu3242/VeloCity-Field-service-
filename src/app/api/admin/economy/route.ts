// GET /api/admin/economy — AI cost ledger, effectiveness scores, business intelligence, SLA contracts
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getCostReport,
  getOrCreateBudget,
  checkBudget,
} from "@/lib/economy/resource-manager";
import {
  calculateEffectiveness,
  getBusinessIntelligence,
  takeSnapshot,
} from "@/lib/economy/telemetry";
import {
  getSLAContract,
  checkSLACompliance,
  TIER_SLAS,
} from "@/lib/economy/priority-economics";

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

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);

  const costReport = getCostReport(tenantId);
  const budget = getOrCreateBudget(tenantId);
  const budgetCheck = checkBudget(tenantId, 0);
  const effectiveness = calculateEffectiveness();
  const businessIntel = getBusinessIntelligence();
  const slaContract = getSLAContract(tenantId);
  const slaCompliance = checkSLACompliance(tenantId, 0);

  return NextResponse.json({
    tenantId,
    costs: {
      report: costReport,
      budget: {
        ...budget,
        utilizationPct: budget.dailyTokenBudget > 0
          ? Math.round((budget.dailyTokenUsed / budget.dailyTokenBudget) * 100)
          : 0,
      },
      budgetStatus: budgetCheck,
    },
    effectiveness,
    businessIntelligence: businessIntel,
    sla: {
      contract: slaContract,
      compliance: slaCompliance,
      availableTiers: TIER_SLAS,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

  if (action === "take_snapshot") {
    const snapshot = takeSnapshot();
    return NextResponse.json({ action: "take_snapshot", snapshot, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'take_snapshot'.` },
    { status: 400 }
  );
}
