// GET  /api/admin/live-workflows — active traces, trace stats, execution topology, active stalls
// POST /api/admin/live-workflows — start_trace | add_step | complete_step | finalize_trace
//                                  | register_node | update_node_status | add_connection
//                                  | detect_stalls | resolve_stall
// Admin-only. Traces and stalls carry a tenantId and are guarded to the caller's tenant.
// Topology nodes model shared infrastructure with no tenant dimension, so mutating them
// requires super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  startTrace,
  addStep,
  completeStep,
  finalizeTrace,
  getActiveTraces,
  getTraceStats,
} from "@/lib/live-workflows/workflow-tracer";
import {
  registerNode,
  updateNodeStatus,
  addConnection,
  getTopology,
  getActiveNodes,
  getFailedNodes,
  type TopologyNode,
} from "@/lib/live-workflows/execution-topology";
import {
  detectStalls,
  resolveStall,
  getActiveStalls,
  getStallStats,
} from "@/lib/live-workflows/stall-detector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NODE_TYPES: TopologyNode["nodeType"][] = [
  "agent", "queue", "event", "gateway", "external",
];
const VALID_NODE_STATUSES: TopologyNode["status"][] = ["active", "idle", "failed"];
const VALID_STEP_STATUSES = ["done", "failed"] as const;
const VALID_TRACE_STATUSES = ["completed", "failed", "stalled"] as const;

const TOPOLOGY_ACTIONS = new Set(["register_node", "update_node_status", "add_connection"]);

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
  void request;

  return NextResponse.json({
    traces: {
      // Trace lists are tenant-pinned; the aggregate stats are platform-wide by design.
      active: getActiveTraces(tenantId),
      stats: getTraceStats(),
    },
    topology: {
      all: getTopology(),
      active: getActiveNodes(),
      failed: getFailedNodes(),
    },
    stalls: {
      active: getActiveStalls(tenantId),
      stats: getStallStats(),
    },
    supported: {
      nodeTypes: VALID_NODE_TYPES,
      nodeStatuses: VALID_NODE_STATUSES,
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

  if (typeof action === "string" && TOPOLOGY_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters shared execution topology and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Workflow tracer ─────────────────────────────────────────────────────

  if (action === "start_trace") {
    const { workflowType, rootEventType } = raw;
    if (typeof workflowType !== "string" || workflowType.trim() === "") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    if (typeof rootEventType !== "string" || rootEventType.trim() === "") {
      return NextResponse.json({ error: "rootEventType required" }, { status: 400 });
    }
    // tenantId comes from the caller's profile, never the body.
    const trace = startTrace(workflowType, tenantId, rootEventType);
    return NextResponse.json({ action: "start_trace", trace, success: true }, { status: 201 });
  }

  if (action === "add_step" || action === "complete_step" || action === "finalize_trace") {
    const { traceId } = raw;
    if (typeof traceId !== "string" || traceId.trim() === "") {
      return NextResponse.json({ error: "traceId required" }, { status: 400 });
    }
    // These lib functions silently no-op on an unknown trace, so ownership is
    // verified against this tenant's active traces before mutating.
    const trace = getActiveTraces(tenantId).find((t) => t.id === traceId);
    if (!trace) {
      return NextResponse.json(
        { error: "Active trace not found for this tenant" },
        { status: 404 }
      );
    }

    if (action === "add_step") {
      const { stepName, agentName } = raw;
      if (typeof stepName !== "string" || stepName.trim() === "") {
        return NextResponse.json({ error: "stepName required" }, { status: 400 });
      }
      addStep(traceId, stepName, typeof agentName === "string" ? agentName : undefined);
      return NextResponse.json({
        action: "add_step",
        trace: getActiveTraces(tenantId).find((t) => t.id === traceId) ?? null,
        success: true,
      });
    }

    if (action === "complete_step") {
      const { stepName, status } = raw;
      if (typeof stepName !== "string" || stepName.trim() === "") {
        return NextResponse.json({ error: "stepName required" }, { status: 400 });
      }
      if (!VALID_STEP_STATUSES.includes(status as (typeof VALID_STEP_STATUSES)[number])) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STEP_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      // completeStep matches only a step still in "running" state — checking here
      // means a stale or misspelled step name is reported rather than swallowed.
      if (!trace.steps.some((s) => s.name === stepName && s.status === "running")) {
        return NextResponse.json(
          { error: `No running step named '${stepName}' on this trace` },
          { status: 404 }
        );
      }
      completeStep(traceId, stepName, status as (typeof VALID_STEP_STATUSES)[number]);
      return NextResponse.json({
        action: "complete_step",
        trace: getActiveTraces(tenantId).find((t) => t.id === traceId) ?? null,
        success: true,
      });
    }

    const { status } = raw;
    if (!VALID_TRACE_STATUSES.includes(status as (typeof VALID_TRACE_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_TRACE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    finalizeTrace(traceId, status as (typeof VALID_TRACE_STATUSES)[number]);
    return NextResponse.json({
      action: "finalize_trace",
      traceId,
      status,
      stats: getTraceStats(),
      success: true,
    });
  }

  // ── Execution topology ──────────────────────────────────────────────────

  if (action === "register_node") {
    const { nodeId, nodeType, label } = raw;
    if (typeof nodeId !== "string" || nodeId.trim() === "") {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }
    if (!VALID_NODE_TYPES.includes(nodeType as TopologyNode["nodeType"])) {
      return NextResponse.json(
        { error: `nodeType must be one of: ${VALID_NODE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof label !== "string" || label.trim() === "") {
      return NextResponse.json({ error: "label required" }, { status: 400 });
    }
    const node = registerNode(nodeId, nodeType as TopologyNode["nodeType"], label);
    return NextResponse.json({ action: "register_node", node, success: true }, { status: 201 });
  }

  if (action === "update_node_status") {
    const { nodeId, status, throughput, errorRate, latencyMs } = raw;
    if (typeof nodeId !== "string") {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }
    if (!VALID_NODE_STATUSES.includes(status as TopologyNode["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_NODE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!getTopology().some((n) => n.nodeId === nodeId)) {
      return NextResponse.json({ error: `Unknown nodeId: ${nodeId}` }, { status: 404 });
    }
    updateNodeStatus(nodeId, status as TopologyNode["status"], {
      ...(typeof throughput === "number" ? { throughput } : {}),
      ...(typeof errorRate === "number" ? { errorRate } : {}),
      ...(typeof latencyMs === "number" ? { latencyMs } : {}),
    });
    return NextResponse.json({
      action: "update_node_status",
      node: getTopology().find((n) => n.nodeId === nodeId) ?? null,
      success: true,
    });
  }

  if (action === "add_connection") {
    const { fromNodeId, toNodeId } = raw;
    if (typeof fromNodeId !== "string" || typeof toNodeId !== "string") {
      return NextResponse.json({ error: "fromNodeId and toNodeId required" }, { status: 400 });
    }
    // Both endpoints must exist — addConnection no-ops on an unknown source and
    // would otherwise record an edge pointing at nothing.
    const topology = getTopology();
    const missing = [fromNodeId, toNodeId].filter(
      (id) => !topology.some((n) => n.nodeId === id)
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown node(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }
    addConnection(fromNodeId, toNodeId);
    return NextResponse.json({
      action: "add_connection",
      node: getTopology().find((n) => n.nodeId === fromNodeId) ?? null,
      success: true,
    });
  }

  // ── Stall detection ─────────────────────────────────────────────────────

  if (action === "detect_stalls") {
    // The sweep runs across all active traces; only this tenant's results are returned.
    const detected = detectStalls().filter((s) => s.tenantId === tenantId);
    return NextResponse.json({
      action: "detect_stalls",
      detected,
      active: getActiveStalls(tenantId),
      stats: getStallStats(),
      success: true,
    });
  }

  if (action === "resolve_stall") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!getActiveStalls(tenantId).some((s) => s.id === id)) {
      return NextResponse.json(
        { error: "Active stall not found for this tenant" },
        { status: 404 }
      );
    }
    resolveStall(id);
    return NextResponse.json({
      action: "resolve_stall",
      id,
      active: getActiveStalls(tenantId),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'start_trace', 'add_step', 'complete_step', 'finalize_trace', 'register_node', 'update_node_status', 'add_connection', 'detect_stalls', or 'resolve_stall'.`,
    },
    { status: 400 }
  );
}
