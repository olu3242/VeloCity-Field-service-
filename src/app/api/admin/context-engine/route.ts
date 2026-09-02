// GET  /api/admin/context-engine — this tenant's hydrated context, workflow contexts, expiry policies
// POST /api/admin/context-engine — hydrate_tenant_context | invalidate_context
//                                  | create_workflow_context | update_workflow_context
//                                  | get_context_lineage | register_expiry_policy | check_expiry
// Admin-only. Tenant and workflow contexts are always keyed to the caller's own tenant —
// tenantId is never read from the request body. Expiry policies are platform-wide TTL rules,
// so registering one requires super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  hydrateTenantContext,
  getTenantContext,
  invalidateContext,
  getActiveContextCount,
  type TenantContext,
} from "@/lib/context-engine/tenant-context";
import {
  createWorkflowContext,
  updateWorkflowContext,
  getWorkflowContext,
  getContextLineage,
} from "@/lib/context-engine/workflow-context";
import {
  registerExpiryPolicy,
  getExpiryPolicy,
  shouldExpire,
  getExpiredContextTypes,
  type ContextExpiryPolicy,
} from "@/lib/context-engine/context-expiry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TIERS: TenantContext["tier"][] = ["standard", "premium", "enterprise"];
const VALID_EXPIRY_ACTIONS: ContextExpiryPolicy["onExpiry"][] = ["purge", "archive", "notify"];
const KNOWN_CONTEXT_TYPES = ["tenant_context", "workflow_context", "ai_snapshot"];

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

// Workflow contexts are keyed by workflowId alone; scope to this tenant.
function ownedWorkflowContext(workflowId: string, tenantId: string) {
  const ctx = getWorkflowContext(workflowId);
  if (!ctx || ctx.tenantId !== tenantId) return undefined;
  return ctx;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");
  const contextType = url.searchParams.get("contextType");

  const workflowCtx = workflowId ? ownedWorkflowContext(workflowId, tenantId) : undefined;

  return NextResponse.json({
    tenantContext: {
      // getTenantContext purges and returns undefined once past TTL.
      current: getTenantContext(tenantId) ?? null,
      // The active count spans every tenant's cached context.
      ...(isSuperAdmin ? { platformActiveCount: getActiveContextCount() } : {}),
    },
    workflowContexts: workflowId
      ? {
          context: workflowCtx ?? null,
          lineage: workflowCtx ? getContextLineage(workflowId) : [],
        }
      : {},
    expiryPolicies: {
      known: KNOWN_CONTEXT_TYPES.map((t) => getExpiryPolicy(t)).filter(
        (p): p is ContextExpiryPolicy => p !== undefined
      ),
      ...(contextType ? { policy: getExpiryPolicy(contextType) ?? null } : {}),
    },
    supported: {
      tiers: VALID_TIERS,
      expiryActions: VALID_EXPIRY_ACTIONS,
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

  // ── Tenant context ──────────────────────────────────────────────────────

  if (action === "hydrate_tenant_context") {
    const { tier, features, limits } = raw;
    if (!VALID_TIERS.includes(tier as TenantContext["tier"])) {
      return NextResponse.json(
        { error: `tier must be one of: ${VALID_TIERS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(features) || !features.every((f) => typeof f === "string")) {
      return NextResponse.json(
        { error: "features must be an array of strings" },
        { status: 400 }
      );
    }
    if (!limits || typeof limits !== "object") {
      return NextResponse.json({ error: "limits object required" }, { status: 400 });
    }
    const parsedLimits: Record<string, number> = {};
    for (const [key, value] of Object.entries(limits as Record<string, unknown>)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return NextResponse.json(
          { error: `limits.${key} must be a number` },
          { status: 400 }
        );
      }
      parsedLimits[key] = value;
    }
    const context = hydrateTenantContext(
      // Always the caller's tenant — hydrating another tenant's context would
      // let a caller redefine that tenant's tier, features and limits.
      tenantId,
      tier as TenantContext["tier"],
      features as string[],
      parsedLimits
    );
    return NextResponse.json({ action: "hydrate_tenant_context", context, success: true }, { status: 201 });
  }

  if (action === "invalidate_context") {
    // invalidateContext takes a tenantId and deletes unconditionally; it is only
    // ever called with the caller's own tenant here.
    invalidateContext(tenantId);
    return NextResponse.json({
      action: "invalidate_context",
      tenantId,
      current: getTenantContext(tenantId) ?? null,
      success: true,
    });
  }

  // ── Workflow context ────────────────────────────────────────────────────

  if (action === "create_workflow_context") {
    const { workflowId, eventType, contextPayload, parentWorkflowId } = raw;
    if (typeof workflowId !== "string" || workflowId.trim() === "") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    // Contexts are keyed by workflowId alone, so creating over an existing one
    // would replace another tenant's context in place.
    const existing = getWorkflowContext(workflowId);
    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.tenantId === tenantId
              ? `Workflow context for '${workflowId}' already exists`
              : "Workflow context not found for this tenant",
        },
        { status: existing.tenantId === tenantId ? 409 : 404 }
      );
    }
    if (parentWorkflowId !== undefined) {
      if (typeof parentWorkflowId !== "string") {
        return NextResponse.json({ error: "parentWorkflowId must be a string" }, { status: 400 });
      }
      // An unknown or foreign parent yields an empty lineage rather than an
      // error, silently losing the ancestry the caller intended to record.
      if (!ownedWorkflowContext(parentWorkflowId, tenantId)) {
        return NextResponse.json(
          { error: "Parent workflow context not found for this tenant" },
          { status: 404 }
        );
      }
    }
    const context = createWorkflowContext(
      workflowId,
      tenantId,
      eventType,
      contextPayload && typeof contextPayload === "object"
        ? (contextPayload as Record<string, unknown>)
        : {},
      typeof parentWorkflowId === "string" ? parentWorkflowId : undefined
    );
    return NextResponse.json({ action: "create_workflow_context", context, success: true }, { status: 201 });
  }

  if (action === "update_workflow_context" || action === "get_context_lineage") {
    const { workflowId, patch } = raw;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (!ownedWorkflowContext(workflowId, tenantId)) {
      return NextResponse.json(
        { error: "Workflow context not found for this tenant" },
        { status: 404 }
      );
    }
    if (action === "get_context_lineage") {
      return NextResponse.json({
        action: "get_context_lineage",
        lineage: getContextLineage(workflowId),
        success: true,
      });
    }
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "patch object required" }, { status: 400 });
    }
    updateWorkflowContext(workflowId, patch as Record<string, unknown>);
    return NextResponse.json({
      action: "update_workflow_context",
      context: getWorkflowContext(workflowId) ?? null,
      success: true,
    });
  }

  // ── Expiry policies ─────────────────────────────────────────────────────

  if (action === "register_expiry_policy") {
    // Policies are global TTL rules applied to every tenant's contexts.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — expiry policies are platform-wide and require super_admin" },
        { status: 403 }
      );
    }
    const { contextType, ttlMs, onExpiry } = raw;
    if (typeof contextType !== "string" || contextType.trim() === "") {
      return NextResponse.json({ error: "contextType required" }, { status: 400 });
    }
    if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      return NextResponse.json({ error: "ttlMs must be a positive number" }, { status: 400 });
    }
    if (!VALID_EXPIRY_ACTIONS.includes(onExpiry as ContextExpiryPolicy["onExpiry"])) {
      return NextResponse.json(
        { error: `onExpiry must be one of: ${VALID_EXPIRY_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    const previous = getExpiryPolicy(contextType);
    registerExpiryPolicy({
      contextType,
      ttlMs,
      onExpiry: onExpiry as ContextExpiryPolicy["onExpiry"],
    });
    return NextResponse.json(
      {
        action: "register_expiry_policy",
        policy: getExpiryPolicy(contextType) ?? null,
        // Registration overwrites by contextType — report when a rule was replaced.
        replaced: previous ?? null,
        success: true,
      },
      { status: previous ? 200 : 201 }
    );
  }

  if (action === "check_expiry") {
    const { contextType, createdAt } = raw;
    if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
      return NextResponse.json(
        { error: "createdAt must be a valid ISO date string" },
        { status: 400 }
      );
    }
    if (typeof contextType === "string") {
      const policy = getExpiryPolicy(contextType);
      if (!policy) {
        // shouldExpire returns false for an unregistered type, which reads as
        // "not expired" rather than "no policy" — distinguish the two.
        return NextResponse.json(
          { error: `No expiry policy registered for contextType: ${contextType}` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        action: "check_expiry",
        contextType,
        policy,
        expired: shouldExpire(contextType, createdAt),
        success: true,
      });
    }
    return NextResponse.json({
      action: "check_expiry",
      expiredTypes: getExpiredContextTypes(createdAt),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'hydrate_tenant_context', 'invalidate_context', 'create_workflow_context', 'update_workflow_context', 'get_context_lineage', 'register_expiry_policy', or 'check_expiry'.`,
    },
    { status: 400 }
  );
}
