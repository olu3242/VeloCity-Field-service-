// GET  /api/admin/enterprise-contracts — this tenant's active/at-risk contracts, failed checks, breaches
// POST /api/admin/enterprise-contracts — register_contract | update_status | record_spend
//                                        | run_governance_checks | record_breach | resolve_breach
// Admin-only. Contracts, checks and breaches all carry a tenantId and every read is filtered
// to the caller's tenant.
//
// Lookup note: the registry exposes no get-contract-by-id — only getActiveContracts(tenantId).
// Ownership can therefore be verified for active contracts but not for draft, suspended,
// expired or terminated ones. update_status is restricted to super_admin for that reason
// rather than shipping a check that cannot cover every case.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerContract,
  updateContractStatus,
  recordSpend,
  getActiveContracts,
  getAtRiskContracts,
  getContractSummary,
  type EnterpriseContract,
} from "@/lib/enterprise-contracts/contract-registry";
import {
  runGovernanceChecks,
  getFailedChecks,
  getGovernanceSummary,
} from "@/lib/enterprise-contracts/governance-enforcer";
import {
  recordBreach,
  resolveBreach,
  getBreachesByContract,
  getActiveBreaches,
  type SLAContractBreachEvent,
} from "@/lib/enterprise-contracts/sla-contract-monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CONTRACT_TYPES: EnterpriseContract["contractType"][] = [
  "sla", "volume_commitment", "custom_terms", "franchise",
];
const VALID_TIERS: EnterpriseContract["tier"][] = [
  "standard", "premium", "enterprise", "franchise",
];
const VALID_STATUSES: EnterpriseContract["status"][] = [
  "draft", "active", "suspended", "expired", "terminated",
];
const VALID_BREACH_TYPES: SLAContractBreachEvent["breachType"][] = [
  "uptime", "response_time", "resolution_time", "throughput",
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

// Only active contracts are resolvable by id through the public registry API.
function ownedActiveContract(id: string, tenantId: string): EnterpriseContract | undefined {
  return getActiveContracts(tenantId).find((c) => c.id === id);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");

  return NextResponse.json({
    contracts: {
      active: getActiveContracts(tenantId),
      // getAtRiskContracts spans all tenants — filter it down.
      atRisk: getAtRiskContracts().filter((c) => c.tenantId === tenantId),
      // The summary is a cross-tenant financial aggregate.
      ...(isSuperAdmin ? { platformSummary: getContractSummary() } : {}),
    },
    governance: {
      failedChecks: getFailedChecks(tenantId),
      ...(isSuperAdmin ? { platformSummary: getGovernanceSummary() } : {}),
    },
    breaches: {
      active: getActiveBreaches(tenantId),
      ...(contractId
        ? {
            byContract: getBreachesByContract(contractId).filter(
              (b) => b.tenantId === tenantId
            ),
          }
        : {}),
    },
    supported: {
      contractTypes: VALID_CONTRACT_TYPES,
      tiers: VALID_TIERS,
      statuses: VALID_STATUSES,
      breachTypes: VALID_BREACH_TYPES,
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
  const isSuperAdmin = auth.profile.role === "super_admin";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Contract registry ───────────────────────────────────────────────────

  if (action === "register_contract") {
    const { contractType, tier, startDate, endDate, commitmentUsd, terms } = raw;
    if (!VALID_CONTRACT_TYPES.includes(contractType as EnterpriseContract["contractType"])) {
      return NextResponse.json(
        { error: `contractType must be one of: ${VALID_CONTRACT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_TIERS.includes(tier as EnterpriseContract["tier"])) {
      return NextResponse.json(
        { error: `tier must be one of: ${VALID_TIERS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json(
        { error: "startDate and endDate must be valid ISO date strings" },
        { status: 400 }
      );
    }
    if (Date.parse(endDate) <= Date.parse(startDate)) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    }
    if (typeof commitmentUsd !== "number" || !Number.isFinite(commitmentUsd) || commitmentUsd < 0) {
      return NextResponse.json(
        { error: "commitmentUsd must be a non-negative number" },
        { status: 400 }
      );
    }
    const contract = registerContract(
      // Always the caller's tenant — never read from the body.
      tenantId,
      contractType as EnterpriseContract["contractType"],
      tier as EnterpriseContract["tier"],
      startDate,
      endDate,
      commitmentUsd,
      terms && typeof terms === "object" ? (terms as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "register_contract", contract, success: true }, { status: 201 });
  }

  if (action === "update_status") {
    // Non-active contracts cannot be resolved by id through the registry's public
    // API, so tenant ownership is unverifiable for exactly the transitions that
    // matter most (draft → active). Restricted rather than partially guarded.
    if (!isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "Forbidden — contract status changes require super_admin because per-contract tenant ownership cannot be verified for non-active contracts",
        },
        { status: 403 }
      );
    }
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as EnterpriseContract["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateContractStatus(id, status as EnterpriseContract["status"]);
    return NextResponse.json({ action: "update_status", id, status, success: true });
  }

  if (action === "record_spend") {
    const { id, amount } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    // Spend only accrues against active contracts, which are resolvable and
    // therefore ownership-checkable.
    const contract = ownedActiveContract(id, tenantId);
    if (!contract) {
      return NextResponse.json(
        { error: "Active contract not found for this tenant" },
        { status: 404 }
      );
    }
    recordSpend(id, amount);
    return NextResponse.json({
      action: "record_spend",
      contract: ownedActiveContract(id, tenantId) ?? null,
      success: true,
    });
  }

  // ── Governance enforcer ─────────────────────────────────────────────────

  if (action === "run_governance_checks") {
    const { contractId } = raw;
    if (typeof contractId !== "string") {
      return NextResponse.json({ error: "contractId required" }, { status: 400 });
    }
    // runGovernanceChecks records failing checks for any id, including unknown
    // ones — verify first so a typo does not pollute the failed-check log.
    if (!ownedActiveContract(contractId, tenantId)) {
      return NextResponse.json(
        { error: "Active contract not found for this tenant" },
        { status: 404 }
      );
    }
    const checks = runGovernanceChecks(contractId, tenantId);
    return NextResponse.json({
      action: "run_governance_checks",
      checks,
      failed: checks.filter((c) => !c.passed),
      success: true,
    });
  }

  // ── SLA breach monitor ──────────────────────────────────────────────────

  if (action === "record_breach") {
    const { contractId, breachType, slaTarget, actualValue } = raw;
    if (typeof contractId !== "string") {
      return NextResponse.json({ error: "contractId required" }, { status: 400 });
    }
    if (!VALID_BREACH_TYPES.includes(breachType as SLAContractBreachEvent["breachType"])) {
      return NextResponse.json(
        { error: `breachType must be one of: ${VALID_BREACH_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof slaTarget !== "number" || !Number.isFinite(slaTarget)) {
      return NextResponse.json({ error: "slaTarget must be a number" }, { status: 400 });
    }
    if (typeof actualValue !== "number" || !Number.isFinite(actualValue)) {
      return NextResponse.json({ error: "actualValue must be a number" }, { status: 400 });
    }
    if (!ownedActiveContract(contractId, tenantId)) {
      return NextResponse.json(
        { error: "Active contract not found for this tenant" },
        { status: 404 }
      );
    }
    const breach = recordBreach(
      contractId,
      tenantId,
      breachType as SLAContractBreachEvent["breachType"],
      slaTarget,
      actualValue
    );
    return NextResponse.json({ action: "record_breach", breach, success: true }, { status: 201 });
  }

  if (action === "resolve_breach") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // resolveBreach takes no tenant argument — confirm ownership against this
    // tenant's active breaches before resolving.
    if (!getActiveBreaches(tenantId).some((b) => b.id === id)) {
      return NextResponse.json(
        { error: "Active breach not found for this tenant" },
        { status: 404 }
      );
    }
    resolveBreach(id);
    return NextResponse.json({
      action: "resolve_breach",
      id,
      active: getActiveBreaches(tenantId),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_contract', 'update_status', 'record_spend', 'run_governance_checks', 'record_breach', or 'resolve_breach'.`,
    },
    { status: 400 }
  );
}
