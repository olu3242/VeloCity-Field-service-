// GET  /api/admin/runtime-memory — this tenant's workflow memory, agent context, continuities
// POST /api/admin/runtime-memory — store_memory | recall_memory | workflow_memory | evict_expired
//                                  | store_context | get_context | top_context | prune_context
//                                  | save_continuity | load_continuity | clear_continuity
// Admin-only.
//
// Isolation note: most accessors in this domain take no tenant parameter — recallMemory,
// getWorkflowMemory, getContext, getTopContext, loadContinuity and clearContinuity all key
// purely on workflowId or agentName. The stored records do carry tenantId, so every read is
// filtered and every write is ownership-checked here rather than trusting the accessor.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  storeMemory,
  recallMemory,
  evictExpiredMemory,
  getWorkflowMemory,
} from "@/lib/runtime-memory/execution-memory";
import {
  storeContext,
  getContext,
  pruneContext,
  getTopContext,
  type AIContextEntry,
} from "@/lib/runtime-memory/ai-context-memory";
import {
  saveContinuity,
  loadContinuity,
  clearContinuity,
  getActiveContinuities,
} from "@/lib/runtime-memory/continuity-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CONTEXT_TYPES: AIContextEntry["contextType"][] = [
  "prior_decision", "user_preference", "pattern", "constraint",
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

// Workflow memory is keyed by workflowId alone; scope it to this tenant.
function ownedWorkflowMemory(workflowId: string, tenantId: string) {
  return getWorkflowMemory(workflowId).filter((e) => e.tenantId === tenantId);
}

// A workflow "belongs" to a tenant if it has no memory yet, or its existing
// memory is this tenant's. This blocks writing into another tenant's workflow.
function canWriteWorkflow(workflowId: string, tenantId: string): boolean {
  const all = getWorkflowMemory(workflowId);
  return all.length === 0 || all.some((e) => e.tenantId === tenantId);
}

function ownedAgentContext(agentName: string, tenantId: string, contextType?: AIContextEntry["contextType"]) {
  return getContext(agentName, contextType).filter((e) => e.tenantId === tenantId);
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");
  const agentName = url.searchParams.get("agentName");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  const continuity = workflowId ? loadContinuity(workflowId) : undefined;

  return NextResponse.json({
    executionMemory: workflowId
      ? { entries: ownedWorkflowMemory(workflowId, tenantId) }
      : {},
    agentContext: agentName
      ? {
          all: ownedAgentContext(agentName, tenantId),
          top: getTopContext(agentName, limit).filter((e) => e.tenantId === tenantId),
        }
      : {},
    continuity: {
      active: getActiveContinuities(tenantId),
      ...(workflowId
        ? { record: continuity && continuity.tenantId === tenantId ? continuity : null }
        : {}),
    },
    supportedContextTypes: VALID_CONTEXT_TYPES,
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

  // ── Execution memory ────────────────────────────────────────────────────

  if (action === "store_memory") {
    const { workflowId, agentName, contextKey, value } = raw;
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (typeof contextKey !== "string" || contextKey.trim() === "") {
      return NextResponse.json({ error: "contextKey required" }, { status: 400 });
    }
    // Memory is keyed by workflowId:contextKey with no tenant in the key, so a
    // write into another tenant's workflow would overwrite their entry.
    if (!canWriteWorkflow(workflowId, tenantId)) {
      return NextResponse.json(
        { error: "Workflow memory belongs to a different tenant" },
        { status: 404 }
      );
    }
    const entry = storeMemory(workflowId, tenantId, agentName, contextKey, value);
    return NextResponse.json({ action: "store_memory", entry, success: true }, { status: 201 });
  }

  if (action === "recall_memory") {
    const { workflowId, contextKey } = raw;
    if (typeof workflowId !== "string" || typeof contextKey !== "string") {
      return NextResponse.json({ error: "workflowId and contextKey required" }, { status: 400 });
    }
    const entry = recallMemory(workflowId, contextKey);
    if (!entry || entry.tenantId !== tenantId) {
      // Missing, expired, and wrong-tenant are deliberately indistinguishable.
      return NextResponse.json(
        { error: "Memory entry not found, expired, or not owned by this tenant" },
        { status: 404 }
      );
    }
    return NextResponse.json({ action: "recall_memory", entry, success: true });
  }

  if (action === "workflow_memory") {
    const { workflowId } = raw;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "workflow_memory",
      entries: ownedWorkflowMemory(workflowId, tenantId),
      success: true,
    });
  }

  if (action === "evict_expired") {
    // Eviction only removes entries past their TTL, so it is safe across tenants —
    // no live data of any tenant can be lost.
    const evicted = evictExpiredMemory();
    return NextResponse.json({ action: "evict_expired", evicted, success: true });
  }

  // ── AI context memory ───────────────────────────────────────────────────

  if (action === "store_context") {
    const { agentName, contextType, content, weight } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (!VALID_CONTEXT_TYPES.includes(contextType as AIContextEntry["contextType"])) {
      return NextResponse.json(
        { error: `contextType must be one of: ${VALID_CONTEXT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof content !== "string" || content.trim() === "") {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) {
      return NextResponse.json({ error: "weight must be between 0 and 1" }, { status: 400 });
    }
    const entry = storeContext(
      agentName,
      tenantId,
      contextType as AIContextEntry["contextType"],
      content,
      weight
    );
    return NextResponse.json({ action: "store_context", entry, success: true }, { status: 201 });
  }

  if (action === "get_context" || action === "top_context") {
    const { agentName, contextType, limit } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (contextType !== undefined && !VALID_CONTEXT_TYPES.includes(contextType as AIContextEntry["contextType"])) {
      return NextResponse.json(
        { error: `contextType must be one of: ${VALID_CONTEXT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (action === "top_context") {
      const capped = typeof limit === "number" ? Math.min(limit, 100) : 10;
      return NextResponse.json({
        action: "top_context",
        entries: getTopContext(agentName, capped).filter((e) => e.tenantId === tenantId),
        success: true,
      });
    }
    return NextResponse.json({
      action: "get_context",
      entries: ownedAgentContext(
        agentName,
        tenantId,
        contextType as AIContextEntry["contextType"] | undefined
      ),
      success: true,
    });
  }

  if (action === "prune_context") {
    // pruneContext rewrites an agent's whole entry list by weight with no tenant
    // filter, so it would delete other tenants' context for that agent. There is
    // no tenant-scoped variant, so it is restricted to super_admin.
    if (!isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "Forbidden — prune_context operates across all tenants for the given agent and requires super_admin",
        },
        { status: 403 }
      );
    }
    const { agentName, minWeight } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (typeof minWeight !== "number" || !Number.isFinite(minWeight) || minWeight < 0 || minWeight > 1) {
      return NextResponse.json({ error: "minWeight must be between 0 and 1" }, { status: 400 });
    }
    const pruned = pruneContext(agentName, minWeight);
    return NextResponse.json({ action: "prune_context", agentName, pruned, success: true });
  }

  // ── Continuity store ────────────────────────────────────────────────────

  if (action === "save_continuity") {
    const { workflowId, lastAgentName, lastEventType, resumeContext } = raw;
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (typeof lastAgentName !== "string" || typeof lastEventType !== "string") {
      return NextResponse.json(
        { error: "lastAgentName and lastEventType required" },
        { status: 400 }
      );
    }
    // Continuity is keyed by workflowId alone and saving overwrites in place, so
    // an unchecked write would clobber another tenant's resume context.
    const existing = loadContinuity(workflowId);
    if (existing && existing.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Continuity record belongs to a different tenant" },
        { status: 404 }
      );
    }
    const record = saveContinuity(
      workflowId,
      tenantId,
      lastAgentName,
      lastEventType,
      resumeContext && typeof resumeContext === "object"
        ? (resumeContext as Record<string, unknown>)
        : {}
    );
    return NextResponse.json({ action: "save_continuity", record, success: true }, { status: 201 });
  }

  if (action === "load_continuity" || action === "clear_continuity") {
    const { workflowId } = raw;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    const record = loadContinuity(workflowId);
    if (!record || record.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Continuity record not found for this tenant" },
        { status: 404 }
      );
    }
    if (action === "load_continuity") {
      return NextResponse.json({ action: "load_continuity", record, success: true });
    }
    // clearContinuity takes no tenant argument — ownership is confirmed above
    // before the delete so one tenant cannot wipe another's resume context.
    clearContinuity(workflowId);
    return NextResponse.json({
      action: "clear_continuity",
      workflowId,
      active: getActiveContinuities(tenantId),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'store_memory', 'recall_memory', 'workflow_memory', 'evict_expired', 'store_context', 'get_context', 'top_context', 'prune_context', 'save_continuity', 'load_continuity', or 'clear_continuity'.`,
    },
    { status: 400 }
  );
}
