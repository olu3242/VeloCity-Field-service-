// GET  /api/admin/global-workflows — this tenant's federations, propagations, workflow chains
// POST /api/admin/global-workflows — register_federation | update_federation_status
//                                    | record_propagation | complete_propagation
//                                    | create_chain | append_to_chain | mark_chain_status
// Admin-only. Federations, propagations and chains all carry a tenantId. Several mutators
// (updateFederationStatus, completePropagation, appendToChain, markChainStatus) take no
// tenant argument and silently no-op on unknown ids, so ownership is verified here first.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerFederation,
  updateFederationStatus,
  getFederatedWorkflows,
  getFailedFederations,
  type FederatedWorkflow,
} from "@/lib/global-workflows/federation-registry";
import {
  recordPropagation,
  completePropagation,
  getActivePropagations,
  getPropagationStats,
} from "@/lib/global-workflows/propagation-tracker";
import {
  createChain,
  appendToChain,
  markChainStatus,
  getChain,
  getActiveChains,
  type WorkflowChain,
} from "@/lib/global-workflows/workflow-chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_FEDERATION_STATUSES: FederatedWorkflow["federationStatus"][] = [
  "synced", "partial", "failed",
];
const VALID_PROPAGATION_OUTCOMES = ["propagated", "failed"] as const;
const VALID_CHAIN_STATUSES: WorkflowChain["status"][] = ["active", "completed", "broken"];

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

function ownedFederation(id: string, tenantId: string): FederatedWorkflow | undefined {
  return getFederatedWorkflows(tenantId).find((f) => f.id === id);
}

function ownedChain(chainId: string, tenantId: string): WorkflowChain | undefined {
  const chain = getChain(chainId);
  if (!chain || chain.tenantId !== tenantId) return undefined;
  return chain;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const chainId = url.searchParams.get("chainId");

  return NextResponse.json({
    federations: {
      all: getFederatedWorkflows(tenantId),
      // getFailedFederations spans all tenants — filter it down.
      failed: getFailedFederations().filter((f) => f.tenantId === tenantId),
    },
    propagations: {
      active: getActivePropagations(tenantId),
      // Propagation stats are a cross-tenant aggregate.
      ...(isSuperAdmin ? { platformStats: getPropagationStats() } : {}),
    },
    chains: {
      active: getActiveChains(tenantId),
      ...(chainId ? { chain: ownedChain(chainId, tenantId) ?? null } : {}),
    },
    supported: {
      federationStatuses: VALID_FEDERATION_STATUSES,
      chainStatuses: VALID_CHAIN_STATUSES,
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

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Federation registry ─────────────────────────────────────────────────

  if (action === "register_federation") {
    const { workflowType, sourceRegion, targetRegions } = raw;
    if (typeof workflowType !== "string" || workflowType.trim() === "") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    if (typeof sourceRegion !== "string" || sourceRegion.trim() === "") {
      return NextResponse.json({ error: "sourceRegion required" }, { status: 400 });
    }
    if (!Array.isArray(targetRegions) || targetRegions.length === 0) {
      return NextResponse.json(
        { error: "targetRegions must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!targetRegions.every((r) => typeof r === "string")) {
      return NextResponse.json({ error: "targetRegions must contain only strings" }, { status: 400 });
    }
    if (targetRegions.includes(sourceRegion)) {
      return NextResponse.json(
        { error: "targetRegions must not include sourceRegion" },
        { status: 400 }
      );
    }
    const federation = registerFederation(
      workflowType,
      sourceRegion,
      targetRegions as string[],
      // Always the caller's tenant.
      tenantId
    );
    return NextResponse.json(
      { action: "register_federation", federation, success: true },
      { status: 201 }
    );
  }

  if (action === "update_federation_status") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!ownedFederation(id, tenantId)) {
      return NextResponse.json({ error: "Federation not found for this tenant" }, { status: 404 });
    }
    if (!VALID_FEDERATION_STATUSES.includes(status as FederatedWorkflow["federationStatus"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_FEDERATION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateFederationStatus(id, status as FederatedWorkflow["federationStatus"]);
    return NextResponse.json({
      action: "update_federation_status",
      federation: ownedFederation(id, tenantId) ?? null,
      success: true,
    });
  }

  // ── Propagation tracker ─────────────────────────────────────────────────

  if (action === "record_propagation") {
    const { workflowId, fromRegion, toRegion } = raw;
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (typeof fromRegion !== "string" || typeof toRegion !== "string") {
      return NextResponse.json({ error: "fromRegion and toRegion required" }, { status: 400 });
    }
    if (fromRegion === toRegion) {
      return NextResponse.json(
        { error: "fromRegion and toRegion must differ" },
        { status: 400 }
      );
    }
    const record = recordPropagation(workflowId, tenantId, fromRegion, toRegion);
    return NextResponse.json({ action: "record_propagation", record, success: true }, { status: 201 });
  }

  if (action === "complete_propagation") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // completePropagation takes no tenant argument and no-ops on unknown ids —
    // confirm the record is a pending one owned by this tenant.
    if (!getActivePropagations(tenantId).some((p) => p.id === id)) {
      return NextResponse.json(
        { error: "Pending propagation not found for this tenant" },
        { status: 404 }
      );
    }
    if (!VALID_PROPAGATION_OUTCOMES.includes(status as (typeof VALID_PROPAGATION_OUTCOMES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_PROPAGATION_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    completePropagation(id, status as (typeof VALID_PROPAGATION_OUTCOMES)[number]);
    return NextResponse.json({
      action: "complete_propagation",
      id,
      status,
      active: getActivePropagations(tenantId),
      success: true,
    });
  }

  // ── Workflow chains ─────────────────────────────────────────────────────

  if (action === "create_chain") {
    const { rootWorkflowId, domain } = raw;
    if (typeof rootWorkflowId !== "string" || rootWorkflowId.trim() === "") {
      return NextResponse.json({ error: "rootWorkflowId required" }, { status: 400 });
    }
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    const chain = createChain(tenantId, rootWorkflowId, domain);
    return NextResponse.json({ action: "create_chain", chain, success: true }, { status: 201 });
  }

  if (action === "append_to_chain") {
    const { chainId, workflowId } = raw;
    if (typeof chainId !== "string" || typeof workflowId !== "string") {
      return NextResponse.json({ error: "chainId and workflowId required" }, { status: 400 });
    }
    const chain = ownedChain(chainId, tenantId);
    if (!chain) {
      return NextResponse.json({ error: "Chain not found for this tenant" }, { status: 404 });
    }
    if (chain.status !== "active") {
      return NextResponse.json(
        { error: `Chain is '${chain.status}' — only active chains can be appended to` },
        { status: 409 }
      );
    }
    // appendToChain pushes unconditionally, so a repeated call would record the
    // same workflow twice in the chain.
    if (chain.chainedWorkflowIds.includes(workflowId) || chain.rootWorkflowId === workflowId) {
      return NextResponse.json(
        { error: `Workflow '${workflowId}' is already part of this chain` },
        { status: 409 }
      );
    }
    appendToChain(chainId, workflowId);
    return NextResponse.json({
      action: "append_to_chain",
      chain: ownedChain(chainId, tenantId) ?? null,
      success: true,
    });
  }

  if (action === "mark_chain_status") {
    const { chainId, status } = raw;
    if (typeof chainId !== "string") {
      return NextResponse.json({ error: "chainId required" }, { status: 400 });
    }
    if (!ownedChain(chainId, tenantId)) {
      return NextResponse.json({ error: "Chain not found for this tenant" }, { status: 404 });
    }
    if (!VALID_CHAIN_STATUSES.includes(status as WorkflowChain["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_CHAIN_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    markChainStatus(chainId, status as WorkflowChain["status"]);
    return NextResponse.json({
      action: "mark_chain_status",
      chain: getChain(chainId) ?? null,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_federation', 'update_federation_status', 'record_propagation', 'complete_propagation', 'create_chain', 'append_to_chain', or 'mark_chain_status'.`,
    },
    { status: 400 }
  );
}
