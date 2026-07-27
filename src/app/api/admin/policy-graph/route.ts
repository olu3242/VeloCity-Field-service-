// GET  /api/admin/policy-graph — policy node tree, dependency map, circular deps, compliance traces
// POST /api/admin/policy-graph — register_node | policy_lineage | get_children
//                                | add_dependency | get_dependencies | get_dependents | find_cycles
//                                | record_trace | traces_by_outcome | compliance_rate
// Admin-only. The policy tree and dependency map are platform-wide governance structures with
// no tenant dimension, so mutating them requires super_admin. Compliance traces carry a
// tenantId and are filtered to the caller's tenant on every read.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  POLICY_NODES,
  registerPolicyNode,
  getPolicyNode,
  getChildren,
  getPolicyLineage,
  type PolicyNode,
} from "@/lib/policy-graph/policy-node";
import {
  addDependency,
  getDependencies,
  getDependents,
  findCircularDependencies,
  type PolicyDependency,
} from "@/lib/policy-graph/dependency-mapper";
import {
  TRACES,
  recordTrace,
  getTracesByOutcome,
  getComplianceRate,
  getRecentTraces,
  type ComplianceTrace,
} from "@/lib/policy-graph/compliance-tracer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NODE_TYPES: PolicyNode["type"][] = ["rule", "escalation", "compliance", "governance"];
const VALID_DEPENDENCY_TYPES: PolicyDependency["dependencyType"][] = [
  "requires", "overrides", "inherits", "triggers",
];
const VALID_OUTCOMES: ComplianceTrace["finalOutcome"][] = ["compliant", "violation", "warning"];

const GRAPH_MUTATIONS = new Set(["register_node", "add_dependency"]);

/**
 * Walks the dependency edges forward from `start` looking for `target`.
 *
 * Used to reject an edge before it is written: if `to` can already reach `from`,
 * adding from→to closes a cycle. The mapper only detects cycles after the fact,
 * and provides no way to remove an edge once added.
 */
function reaches(start: string, target: string, maxDepth = 20): boolean {
  const seen = new Set<string>([start]);
  const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || item.depth >= maxDepth) continue;
    for (const dep of getDependencies(item.id)) {
      if (dep.toPolicyId === target) return true;
      if (!seen.has(dep.toPolicyId)) {
        seen.add(dep.toPolicyId);
        queue.push({ id: dep.toPolicyId, depth: item.depth + 1 });
      }
    }
  }
  return false;
}

function tenantTraces(tenantId: string): ComplianceTrace[] {
  return TRACES.filter((t) => t.tenantId === tenantId);
}

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
  const policyId = url.searchParams.get("policyId");
  const eventType = url.searchParams.get("eventType");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const owned = tenantTraces(tenantId);

  return NextResponse.json({
    nodes: {
      all: Array.from(POLICY_NODES.values()),
      ...(policyId
        ? {
            node: getPolicyNode(policyId) ?? null,
            children: getChildren(policyId),
            lineage: getPolicyLineage(policyId),
          }
        : {}),
    },
    dependencies: {
      ...(policyId
        ? { from: getDependencies(policyId), to: getDependents(policyId) }
        : {}),
      circular: findCircularDependencies(),
    },
    compliance: {
      // Traces are tenant-scoped; the lib accessors do not filter, so the rate is
      // recomputed here over this tenant's traces only.
      recent: getRecentTraces(limit).filter((t) => t.tenantId === tenantId),
      rate:
        owned.length > 0
          ? owned.filter((t) => t.finalOutcome === "compliant").length / owned.length
          : 0,
      ...(eventType
        ? {
            byEventType: owned.filter((t) => t.eventType === eventType),
          }
        : {}),
    },
    supported: {
      nodeTypes: VALID_NODE_TYPES,
      dependencyTypes: VALID_DEPENDENCY_TYPES,
      outcomes: VALID_OUTCOMES,
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

  if (typeof action === "string" && GRAPH_MUTATIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters the platform policy graph and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Policy nodes ────────────────────────────────────────────────────────

  if (action === "register_node") {
    const { policyId, name, type, parentId } = raw;
    if (typeof policyId !== "string" || policyId.trim() === "") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!VALID_NODE_TYPES.includes(type as PolicyNode["type"])) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_NODE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    // registerPolicyNode overwrites in place, which would silently detach the
    // existing node's children — including the pre-registered root nodes.
    if (POLICY_NODES.has(policyId)) {
      return NextResponse.json(
        { error: `Policy node '${policyId}' already exists and would be overwritten` },
        { status: 409 }
      );
    }
    if (parentId !== undefined) {
      if (typeof parentId !== "string") {
        return NextResponse.json({ error: "parentId must be a string" }, { status: 400 });
      }
      // A missing parent is silently ignored by the lib, orphaning the node.
      if (!POLICY_NODES.has(parentId)) {
        return NextResponse.json({ error: `Unknown parentId: ${parentId}` }, { status: 404 });
      }
    }
    const node = registerPolicyNode(
      policyId,
      name,
      type as PolicyNode["type"],
      typeof parentId === "string" ? parentId : undefined
    );
    return NextResponse.json({ action: "register_node", node, success: true }, { status: 201 });
  }

  if (action === "policy_lineage" || action === "get_children") {
    const { policyId } = raw;
    if (typeof policyId !== "string") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    if (!POLICY_NODES.has(policyId)) {
      return NextResponse.json({ error: `Unknown policyId: ${policyId}` }, { status: 404 });
    }
    return NextResponse.json({
      action,
      nodes: action === "policy_lineage" ? getPolicyLineage(policyId) : getChildren(policyId),
      success: true,
    });
  }

  // ── Dependency mapper ───────────────────────────────────────────────────

  if (action === "add_dependency") {
    const { fromPolicyId, toPolicyId, dependencyType } = raw;
    if (typeof fromPolicyId !== "string" || typeof toPolicyId !== "string") {
      return NextResponse.json(
        { error: "fromPolicyId and toPolicyId required" },
        { status: 400 }
      );
    }
    if (fromPolicyId === toPolicyId) {
      return NextResponse.json(
        { error: "A policy cannot depend on itself" },
        { status: 400 }
      );
    }
    if (!VALID_DEPENDENCY_TYPES.includes(dependencyType as PolicyDependency["dependencyType"])) {
      return NextResponse.json(
        { error: `dependencyType must be one of: ${VALID_DEPENDENCY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    // Reject the edge if it would close a cycle. The mapper can only report
    // cycles after they exist and offers no removal, so this must be pre-checked.
    if (reaches(toPolicyId, fromPolicyId)) {
      return NextResponse.json(
        {
          error: `Adding ${fromPolicyId} → ${toPolicyId} would create a circular dependency`,
          existingPathFrom: toPolicyId,
          existingPathTo: fromPolicyId,
        },
        { status: 409 }
      );
    }
    const dependency = addDependency(
      fromPolicyId,
      toPolicyId,
      dependencyType as PolicyDependency["dependencyType"]
    );
    return NextResponse.json({ action: "add_dependency", dependency, success: true }, { status: 201 });
  }

  if (action === "get_dependencies" || action === "get_dependents") {
    const { policyId } = raw;
    if (typeof policyId !== "string") {
      return NextResponse.json({ error: "policyId required" }, { status: 400 });
    }
    return NextResponse.json({
      action,
      dependencies:
        action === "get_dependencies" ? getDependencies(policyId) : getDependents(policyId),
      success: true,
    });
  }

  if (action === "find_cycles") {
    const cycles = findCircularDependencies();
    return NextResponse.json({
      action: "find_cycles",
      cycles,
      // The cycle search is bounded at depth 10; longer loops are not reported.
      note: "Cycle detection is bounded at depth 10 — longer loops may not appear.",
      success: true,
    });
  }

  // ── Compliance tracer ───────────────────────────────────────────────────

  if (action === "record_trace") {
    const { eventType, policiesEvaluated, finalOutcome } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!Array.isArray(policiesEvaluated) || policiesEvaluated.length === 0) {
      return NextResponse.json(
        { error: "policiesEvaluated must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!policiesEvaluated.every((p) => typeof p === "string")) {
      return NextResponse.json(
        { error: "policiesEvaluated must contain only strings" },
        { status: 400 }
      );
    }
    if (!VALID_OUTCOMES.includes(finalOutcome as ComplianceTrace["finalOutcome"])) {
      return NextResponse.json(
        { error: `finalOutcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    const trace = recordTrace(
      eventType,
      // Always the caller's tenant — a forged tenantId would pollute another
      // tenant's compliance rate.
      tenantId,
      policiesEvaluated as string[],
      finalOutcome as ComplianceTrace["finalOutcome"]
    );
    return NextResponse.json({ action: "record_trace", trace, success: true }, { status: 201 });
  }

  if (action === "traces_by_outcome") {
    const { outcome } = raw;
    if (!VALID_OUTCOMES.includes(outcome as ComplianceTrace["finalOutcome"])) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "traces_by_outcome",
      traces: getTracesByOutcome(outcome as ComplianceTrace["finalOutcome"]).filter(
        (t) => t.tenantId === tenantId
      ),
      success: true,
    });
  }

  if (action === "compliance_rate") {
    const { eventType } = raw;
    if (eventType !== undefined && typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType must be a string" }, { status: 400 });
    }
    // getComplianceRate spans all tenants, so the tenant-scoped rate is computed
    // here and the platform-wide figure is reported separately for context.
    const owned = tenantTraces(tenantId).filter(
      (t) => eventType === undefined || t.eventType === eventType
    );
    const rate =
      owned.length > 0
        ? owned.filter((t) => t.finalOutcome === "compliant").length / owned.length
        : 0;
    return NextResponse.json({
      action: "compliance_rate",
      rate,
      sampleSize: owned.length,
      platformWideRate: getComplianceRate(
        typeof eventType === "string" ? eventType : undefined
      ),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_node', 'policy_lineage', 'get_children', 'add_dependency', 'get_dependencies', 'get_dependents', 'find_cycles', 'record_trace', 'traces_by_outcome', or 'compliance_rate'.`,
    },
    { status: 400 }
  );
}
