// GET  /api/admin/ops-graph — graph snapshot, node neighbourhood, operational patterns, healing history
// POST /api/admin/ops-graph — add_node | add_edge | get_related | get_subgraph
//                             | record_pattern | find_similar_patterns | increment_pattern
//                             | trigger_healing | override_healing
// Admin-only; tenant-scoped.
//
// scheduleSelfHealingChecks() is deliberately NOT exposed: it installs a process-level
// setInterval, so calling it per HTTP request would leak a new timer on every call.
// It belongs to process bootstrap, not a request handler.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  GLOBAL_GRAPH,
  type NodeType,
  type EdgeType,
} from "@/lib/ops-graph/graph";
import {
  recordPattern,
  findSimilarPatterns,
  incrementPattern,
  getAllPatterns,
  getPatternSummary,
  type PatternType,
} from "@/lib/ops-graph/knowledge";
import {
  triggerHealing,
  overrideHealing,
  getHealingHistory,
  getActiveHealingActions,
  type HealingActionType,
} from "@/lib/ops-graph/self-healing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NODE_TYPES: NodeType[] = [
  "provider", "customer", "job", "dispute", "payout", "workflow", "agent", "automation",
];
const VALID_EDGE_TYPES: EdgeType[] = [
  "resolved_by", "triggered_by", "assigned_to", "related_to",
  "escalated_to", "paid_via", "disputed_by", "processed_by",
];
const VALID_PATTERN_TYPES: PatternType[] = [
  "anomaly", "workflow_optimization", "escalation_pattern", "seasonal", "risk_correlation",
];
const VALID_HEALING_ACTIONS: HealingActionType[] = [
  "retry_queue_item", "reset_circuit", "pause_agent",
  "reroute_workflow", "quarantine_handler", "recover_stuck_workflow",
];

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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("nodeId");
  const depth = Math.min(parseInt(url.searchParams.get("depth") ?? "1", 10), 5);

  const snapshot = GLOBAL_GRAPH.toJSON();

  return NextResponse.json({
    graph: {
      totals: { nodes: snapshot.nodes.length, edges: snapshot.edges.length },
      ...(nodeId
        ? {
            node: GLOBAL_GRAPH.nodes.get(nodeId) ?? null,
            edges: GLOBAL_GRAPH.getNodeEdges(nodeId),
            related: GLOBAL_GRAPH.getRelated(nodeId),
            subgraph: GLOBAL_GRAPH.getSubgraph(nodeId, Number.isNaN(depth) ? 1 : depth),
          }
        : { snapshot }),
    },
    patterns: {
      all: getAllPatterns(),
      summary: getPatternSummary(),
    },
    healing: {
      active: getActiveHealingActions(),
      history: getHealingHistory(),
    },
    supported: {
      nodeTypes: VALID_NODE_TYPES,
      edgeTypes: VALID_EDGE_TYPES,
      patternTypes: VALID_PATTERN_TYPES,
      healingActions: VALID_HEALING_ACTIONS,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  // ── Graph ───────────────────────────────────────────────────────────────

  if (action === "add_node") {
    const { id, type, label, attributes } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_NODE_TYPES.includes(type as NodeType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_NODE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof label !== "string" || label.trim() === "") {
      return NextResponse.json({ error: "label required" }, { status: 400 });
    }
    const node = GLOBAL_GRAPH.addNode({
      id,
      type: type as NodeType,
      label,
      attributes:
        attributes && typeof attributes === "object"
          ? (attributes as Record<string, unknown>)
          : {},
    });
    return NextResponse.json({ action: "add_node", node, success: true }, { status: 201 });
  }

  if (action === "add_edge") {
    const { from, to, type, weight, metadata } = raw;
    if (typeof from !== "string" || typeof to !== "string") {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }
    if (!VALID_EDGE_TYPES.includes(type as EdgeType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_EDGE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    // Reject dangling edges — getRelated/getSubgraph silently drop unknown
    // endpoints, so an unvalidated edge would be invisible rather than an error.
    const missing = [from, to].filter((n) => !GLOBAL_GRAPH.nodes.has(n));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown node(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }
    const edge = GLOBAL_GRAPH.addEdge({
      from,
      to,
      type: type as EdgeType,
      weight: typeof weight === "number" ? weight : 1,
      metadata:
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "add_edge", edge, success: true }, { status: 201 });
  }

  if (action === "get_related" || action === "get_subgraph") {
    const { nodeId, edgeType, depth } = raw;
    if (typeof nodeId !== "string" || nodeId.trim() === "") {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }
    if (!GLOBAL_GRAPH.nodes.has(nodeId)) {
      return NextResponse.json({ error: `Unknown nodeId: ${nodeId}` }, { status: 404 });
    }

    if (action === "get_subgraph") {
      const requested = typeof depth === "number" ? depth : 1;
      if (requested < 1) {
        return NextResponse.json({ error: "depth must be at least 1" }, { status: 400 });
      }
      // Cap traversal depth — the walk is breadth-first over a shared global graph.
      return NextResponse.json({
        action: "get_subgraph",
        subgraph: GLOBAL_GRAPH.getSubgraph(nodeId, Math.min(requested, 5)),
        success: true,
      });
    }

    if (edgeType !== undefined && !VALID_EDGE_TYPES.includes(edgeType as EdgeType)) {
      return NextResponse.json(
        { error: `edgeType must be one of: ${VALID_EDGE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "get_related",
      related: GLOBAL_GRAPH.getRelated(nodeId, edgeType as EdgeType | undefined),
      edges: GLOBAL_GRAPH.getNodeEdges(nodeId),
      success: true,
    });
  }

  // ── Knowledge patterns ──────────────────────────────────────────────────

  if (action === "record_pattern") {
    const { type, description, confidence, occurrences, data } = raw;
    if (!VALID_PATTERN_TYPES.includes(type as PatternType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_PATTERN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
      return NextResponse.json({ error: "confidence must be between 0 and 1" }, { status: 400 });
    }
    const pattern = recordPattern({
      type: type as PatternType,
      description,
      confidence: typeof confidence === "number" ? confidence : 0.5,
      occurrences: typeof occurrences === "number" ? occurrences : 1,
      data: data && typeof data === "object" ? (data as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "record_pattern", pattern, success: true }, { status: 201 });
  }

  if (action === "find_similar_patterns") {
    const { type, minConfidence } = raw;
    if (!VALID_PATTERN_TYPES.includes(type as PatternType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_PATTERN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const patterns = findSimilarPatterns(
      type as PatternType,
      typeof minConfidence === "number" ? minConfidence : undefined
    );
    return NextResponse.json({ action: "find_similar_patterns", patterns, success: true });
  }

  if (action === "increment_pattern") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // incrementPattern silently no-ops on an unknown id — verify so typos surface.
    if (!getAllPatterns().some((p) => p.id === id)) {
      return NextResponse.json({ error: `Unknown pattern id: ${id}` }, { status: 404 });
    }
    incrementPattern(id);
    return NextResponse.json({
      action: "increment_pattern",
      id,
      summary: getPatternSummary(),
      success: true,
    });
  }

  // ── Self-healing ────────────────────────────────────────────────────────

  if (action === "trigger_healing" || action === "override_healing") {
    // Healing actions mutate process-global runtime state (reset_circuit calls
    // straight through to the shared circuit breaker), so they are super_admin only.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: `Forbidden — '${action}' alters platform-wide runtime state and requires super_admin` },
        { status: 403 }
      );
    }

    if (action === "override_healing") {
      const { id } = raw;
      if (typeof id !== "string") {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      // Overriding admin comes from the session, never the body — the audit
      // trail on overriddenBy must not be forgeable.
      if (!overrideHealing(id, auth.userId)) {
        return NextResponse.json({ error: `Unknown healing action id: ${id}` }, { status: 404 });
      }
      return NextResponse.json({
        action: "override_healing",
        id,
        history: getHealingHistory(),
        success: true,
      });
    }

    const { trigger, healingAction, targetId, reason } = raw;
    if (typeof trigger !== "string" || trigger.trim() === "") {
      return NextResponse.json({ error: "trigger required" }, { status: 400 });
    }
    if (!VALID_HEALING_ACTIONS.includes(healingAction as HealingActionType)) {
      return NextResponse.json(
        { error: `healingAction must be one of: ${VALID_HEALING_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof targetId !== "string" || targetId.trim() === "") {
      return NextResponse.json({ error: "targetId required" }, { status: 400 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required for audit trail" }, { status: 400 });
    }
    const result = await triggerHealing(
      trigger,
      healingAction as HealingActionType,
      targetId,
      reason
    );
    return NextResponse.json({ action: "trigger_healing", healing: result, success: true }, { status: 201 });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'add_node', 'add_edge', 'get_related', 'get_subgraph', 'record_pattern', 'find_similar_patterns', 'increment_pattern', 'trigger_healing', or 'override_healing'.`,
    },
    { status: 400 }
  );
}
