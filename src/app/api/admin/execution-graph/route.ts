// GET  /api/admin/execution-graph — dependency graph, recent execution nodes, replay history
// POST /api/admin/execution-graph — record_dependency | critical_path | dependencies_from | dependencies_to
//                                   | start_node | complete_node | get_lineage | get_children
//                                   | record_replay | update_replay_outcome | replay_chain_for
// Admin-only. Execution nodes and replay entries carry an optional tenantId; reads and
// mutations are filtered to the caller's tenant. The dependency graph is a platform-wide
// topology of event types with no tenant dimension.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordDependency,
  getDependenciesFrom,
  getDependenciesTo,
  getFullGraph,
  findCriticalPath,
  type WorkflowDependency,
} from "@/lib/execution-graph/dependency-graph";
import {
  startNode,
  completeNode,
  getNode,
  getLineage,
  getChildren,
  getRecentNodes,
  type ExecutionNode,
} from "@/lib/execution-graph/lineage-tracker";
import {
  recordReplay,
  getReplayHistory,
  getReplayChainFor,
  updateReplayOutcome,
  type ReplayChainEntry,
} from "@/lib/execution-graph/replay-chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DEPENDENCY_TYPES: WorkflowDependency["dependencyType"][] = [
  "triggers", "requires", "optional",
];
const VALID_NODE_STATUSES = ["success", "failed", "skipped"] as const;
const VALID_OUTCOMES: ReplayChainEntry["outcome"][] = ["success", "failed", "pending"];

// Nodes and replay entries may be platform-level (no tenantId) or tenant-owned.
function visibleToTenant(
  record: { tenantId?: string },
  tenantId: string
): boolean {
  return record.tenantId === undefined || record.tenantId === tenantId;
}

function ownedNode(id: string, tenantId: string): ExecutionNode | undefined {
  const node = getNode(id);
  if (!node || !visibleToTenant(node, tenantId)) return undefined;
  return node;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType");
  const nodeId = url.searchParams.get("nodeId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const owned = nodeId ? ownedNode(nodeId, tenantId) : undefined;

  return NextResponse.json({
    dependencies: {
      graph: getFullGraph(),
      ...(eventType
        ? {
            from: getDependenciesFrom(eventType),
            to: getDependenciesTo(eventType),
            criticalPath: findCriticalPath(eventType),
          }
        : {}),
    },
    lineage: {
      recent: getRecentNodes(limit).filter((n) => visibleToTenant(n, tenantId)),
      ...(owned
        ? {
            node: owned,
            chain: getLineage(owned.id),
            children: getChildren(owned.id),
          }
        : {}),
    },
    replays: {
      history: getReplayHistory(eventType ?? undefined, limit).filter((r) =>
        visibleToTenant(r, tenantId)
      ),
    },
    supported: {
      dependencyTypes: VALID_DEPENDENCY_TYPES,
      nodeStatuses: VALID_NODE_STATUSES,
      replayOutcomes: VALID_OUTCOMES,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
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

  // ── Dependency graph ────────────────────────────────────────────────────

  if (action === "record_dependency") {
    const { from, to, dependencyType, delayMs } = raw;
    if (typeof from !== "string" || from.trim() === "") {
      return NextResponse.json({ error: "from required" }, { status: 400 });
    }
    if (typeof to !== "string" || to.trim() === "") {
      return NextResponse.json({ error: "to required" }, { status: 400 });
    }
    if (from === to) {
      // A self-edge would make findCriticalPath's visited-set the only thing
      // preventing an immediate cycle; reject it at the boundary instead.
      return NextResponse.json(
        { error: "from and to must differ — self-dependencies are not valid" },
        { status: 400 }
      );
    }
    if (!VALID_DEPENDENCY_TYPES.includes(dependencyType as WorkflowDependency["dependencyType"])) {
      return NextResponse.json(
        { error: `dependencyType must be one of: ${VALID_DEPENDENCY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0) {
      return NextResponse.json({ error: "delayMs must be a non-negative number" }, { status: 400 });
    }
    recordDependency(from, to, dependencyType as WorkflowDependency["dependencyType"], delayMs);
    return NextResponse.json(
      { action: "record_dependency", from: getDependenciesFrom(from), success: true },
      { status: 201 }
    );
  }

  if (action === "critical_path" || action === "dependencies_from" || action === "dependencies_to") {
    const { eventType } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (action === "critical_path") {
      const path = findCriticalPath(eventType);
      return NextResponse.json({
        action: "critical_path",
        path,
        // The walk stops at depth 10; a path at the cap may be truncated.
        truncated: path.length >= 11,
        success: true,
      });
    }
    return NextResponse.json({
      action,
      dependencies:
        action === "dependencies_from"
          ? getDependenciesFrom(eventType)
          : getDependenciesTo(eventType),
      success: true,
    });
  }

  // ── Lineage tracker ─────────────────────────────────────────────────────

  if (action === "start_node") {
    const { eventType, agentName, parentId, metadata } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    // A parent must exist and be visible to this tenant, or the child would be
    // silently orphaned (startNode skips the link when the parent is missing).
    if (parentId !== undefined) {
      if (typeof parentId !== "string") {
        return NextResponse.json({ error: "parentId must be a string" }, { status: 400 });
      }
      if (!ownedNode(parentId, tenantId)) {
        return NextResponse.json(
          { error: "Parent node not found for this tenant" },
          { status: 404 }
        );
      }
    }
    const node = startNode(eventType, {
      tenantId,
      ...(typeof agentName === "string" ? { agentName } : {}),
      ...(typeof parentId === "string" ? { parentId } : {}),
      ...(metadata && typeof metadata === "object"
        ? { metadata: metadata as Record<string, unknown> }
        : {}),
    });
    return NextResponse.json({ action: "start_node", node, success: true }, { status: 201 });
  }

  if (action === "complete_node") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const node = ownedNode(id, tenantId);
    if (!node) {
      return NextResponse.json({ error: "Node not found for this tenant" }, { status: 404 });
    }
    if (node.status !== "running") {
      return NextResponse.json(
        { error: `Node is '${node.status}' — only running nodes can be completed` },
        { status: 409 }
      );
    }
    if (!VALID_NODE_STATUSES.includes(status as (typeof VALID_NODE_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_NODE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    completeNode(id, status as (typeof VALID_NODE_STATUSES)[number]);
    return NextResponse.json({
      action: "complete_node",
      node: getNode(id) ?? null,
      success: true,
    });
  }

  if (action === "get_lineage" || action === "get_children") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!ownedNode(id, tenantId)) {
      return NextResponse.json({ error: "Node not found for this tenant" }, { status: 404 });
    }
    return NextResponse.json({
      action,
      nodes: action === "get_lineage" ? getLineage(id) : getChildren(id),
      success: true,
    });
  }

  // ── Replay chain ────────────────────────────────────────────────────────

  if (action === "record_replay") {
    const { originalEventId, eventType, outcome, parentReplayId } = raw;
    if (typeof originalEventId !== "string" || originalEventId.trim() === "") {
      return NextResponse.json({ error: "originalEventId required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (outcome !== undefined && !VALID_OUTCOMES.includes(outcome as ReplayChainEntry["outcome"])) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    if (parentReplayId !== undefined) {
      if (typeof parentReplayId !== "string") {
        return NextResponse.json({ error: "parentReplayId must be a string" }, { status: 400 });
      }
      const parent = getReplayHistory(undefined, 500).find((r) => r.id === parentReplayId);
      if (!parent || !visibleToTenant(parent, tenantId)) {
        return NextResponse.json(
          { error: "Parent replay not found for this tenant" },
          { status: 404 }
        );
      }
    }
    const entry = recordReplay({
      originalEventId,
      eventType,
      tenantId,
      // replayedBy is taken from the session so the audit trail is unforgeable.
      replayedBy: auth.userId,
      outcome: (outcome as ReplayChainEntry["outcome"]) ?? "pending",
      ...(typeof parentReplayId === "string" ? { parentReplayId } : {}),
    });
    return NextResponse.json({ action: "record_replay", entry, success: true }, { status: 201 });
  }

  if (action === "update_replay_outcome") {
    const { id, outcome } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_OUTCOMES.includes(outcome as ReplayChainEntry["outcome"])) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    const entry = getReplayHistory(undefined, 500).find((r) => r.id === id);
    if (!entry || !visibleToTenant(entry, tenantId)) {
      return NextResponse.json(
        { error: "Replay entry not found for this tenant" },
        { status: 404 }
      );
    }
    updateReplayOutcome(id, outcome as ReplayChainEntry["outcome"]);
    return NextResponse.json({ action: "update_replay_outcome", id, outcome, success: true });
  }

  if (action === "replay_chain_for") {
    const { originalEventId } = raw;
    if (typeof originalEventId !== "string" || originalEventId.trim() === "") {
      return NextResponse.json({ error: "originalEventId required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "replay_chain_for",
      chain: getReplayChainFor(originalEventId).filter((r) => visibleToTenant(r, tenantId)),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_dependency', 'critical_path', 'dependencies_from', 'dependencies_to', 'start_node', 'complete_node', 'get_lineage', 'get_children', 'record_replay', 'update_replay_outcome', or 'replay_chain_for'.`,
    },
    { status: 400 }
  );
}
