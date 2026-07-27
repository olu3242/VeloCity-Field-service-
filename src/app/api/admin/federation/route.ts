// GET  /api/admin/federation — node health, routes, federated identities, runtime capabilities
// POST /api/admin/federation — register_node | update_node_status | create_route | suspend_route
//                              | federate_identity | verify_identity | mark_capability_degraded | delegate_task
// Admin-only; tenant-scoped. Governs cross-node mesh topology, trust, and delegation.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import type { AgentName } from "@/lib/contracts/agents";
import {
  registerNode,
  updateNodeStatus,
  getConnectedNodes,
  getTrustedNodes,
  getFederationHealth,
  type FederatedNode,
} from "@/lib/federation/federation-hub";
import {
  createRoute,
  suspendRoute,
  getActiveRoutes,
  getBestRoute,
  type FederationRoute,
} from "@/lib/federation/federation-router";
import {
  federateIdentity,
  verifyIdentity,
  resolveIdentity,
  getIdentitiesByNode,
  getUnverifiedIdentities,
  type FederatedIdentity,
} from "@/lib/federation/identity-bridge";
import {
  discoverCapabilities,
  findCapableAgent,
  findAllCapableAgents,
  markCapabilityDegraded,
} from "@/lib/federation/capability-discovery";
import {
  delegateTask,
  getDelegation,
  getActiveDelegations,
  type DelegationTaskType,
} from "@/lib/federation/coordinator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NODE_TYPES: FederatedNode["nodeType"][] = [
  "platform", "tenant_cluster", "regional_hub", "external_partner",
];
const VALID_NODE_STATUSES: FederatedNode["status"][] = ["connected", "degraded", "isolated"];
const VALID_ROUTE_TYPES: FederationRoute["routeType"][] = ["workflow", "event", "data", "command"];
const VALID_IDENTITY_TYPES: FederatedIdentity["identityType"][] = ["user", "agent", "tenant", "service"];
const VALID_TASK_TYPES: DelegationTaskType[] = ["escalate", "handoff", "consult", "notify", "coordinate"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;

function isAgentName(value: unknown): value is AgentName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AGENT_REGISTRY, value);
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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("nodeId");
  const federatedId = url.searchParams.get("federatedId");
  const eventType = url.searchParams.get("eventType");
  const delegationId = url.searchParams.get("delegationId");
  const minTrustScore = parseInt(url.searchParams.get("minTrustScore") ?? "70", 10);

  const sourceNodeId = url.searchParams.get("sourceNodeId");
  const targetNodeId = url.searchParams.get("targetNodeId");
  const routeType = url.searchParams.get("routeType") as FederationRoute["routeType"] | null;

  return NextResponse.json({
    nodes: {
      connected: getConnectedNodes(),
      trusted: getTrustedNodes(Number.isNaN(minTrustScore) ? 70 : minTrustScore),
      health: getFederationHealth(),
    },
    routes: {
      active: getActiveRoutes(sourceNodeId ?? undefined),
      ...(sourceNodeId && targetNodeId && routeType && VALID_ROUTE_TYPES.includes(routeType)
        ? { best: getBestRoute(sourceNodeId, targetNodeId, routeType) ?? null }
        : {}),
    },
    identities: {
      unverified: getUnverifiedIdentities(),
      ...(nodeId ? { byNode: getIdentitiesByNode(nodeId) } : {}),
      ...(federatedId ? { resolved: resolveIdentity(federatedId) ?? null } : {}),
    },
    capabilities: {
      all: discoverCapabilities(),
      ...(eventType
        ? {
            capableAgent: findCapableAgent(eventType),
            allCapableAgents: findAllCapableAgents(eventType),
          }
        : {}),
    },
    delegations: {
      active: getActiveDelegations(),
      ...(delegationId ? { delegation: getDelegation(delegationId) } : {}),
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

  const { action } = body as Record<string, unknown>;

  if (action === "register_node") {
    const { nodeId, nodeName, nodeType } = body as Record<string, unknown>;
    if (typeof nodeId !== "string" || typeof nodeName !== "string") {
      return NextResponse.json({ error: "nodeId and nodeName required" }, { status: 400 });
    }
    if (!VALID_NODE_TYPES.includes(nodeType as FederatedNode["nodeType"])) {
      return NextResponse.json(
        { error: `nodeType must be one of: ${VALID_NODE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const node = registerNode(nodeId, nodeName, nodeType as FederatedNode["nodeType"]);
    return NextResponse.json({ action: "register_node", node, success: true }, { status: 201 });
  }

  if (action === "update_node_status") {
    const { nodeId, status, latencyMs, trustScore } = body as Record<string, unknown>;
    if (typeof nodeId !== "string") {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }
    if (!VALID_NODE_STATUSES.includes(status as FederatedNode["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_NODE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateNodeStatus(
      nodeId,
      status as FederatedNode["status"],
      typeof latencyMs === "number" ? latencyMs : 50,
      typeof trustScore === "number" ? trustScore : 80
    );
    return NextResponse.json({ action: "update_node_status", nodeId, health: getFederationHealth(), success: true });
  }

  if (action === "create_route") {
    const { sourceNodeId, targetNodeId, routeType, priority } = body as Record<string, unknown>;
    if (typeof sourceNodeId !== "string" || typeof targetNodeId !== "string") {
      return NextResponse.json({ error: "sourceNodeId and targetNodeId required" }, { status: 400 });
    }
    if (!VALID_ROUTE_TYPES.includes(routeType as FederationRoute["routeType"])) {
      return NextResponse.json(
        { error: `routeType must be one of: ${VALID_ROUTE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const route = createRoute(
      sourceNodeId,
      targetNodeId,
      routeType as FederationRoute["routeType"],
      typeof priority === "number" ? priority : 50
    );
    return NextResponse.json({ action: "create_route", route, success: true }, { status: 201 });
  }

  if (action === "suspend_route") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    suspendRoute(id);
    return NextResponse.json({ action: "suspend_route", id, success: true });
  }

  if (action === "federate_identity") {
    const { localId, federatedId, nodeId, identityType } = body as Record<string, unknown>;
    if (typeof localId !== "string" || typeof federatedId !== "string" || typeof nodeId !== "string") {
      return NextResponse.json(
        { error: "localId, federatedId, and nodeId required" },
        { status: 400 }
      );
    }
    if (!VALID_IDENTITY_TYPES.includes(identityType as FederatedIdentity["identityType"])) {
      return NextResponse.json(
        { error: `identityType must be one of: ${VALID_IDENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const identity = federateIdentity(
      localId,
      federatedId,
      nodeId,
      tenantId,
      identityType as FederatedIdentity["identityType"]
    );
    return NextResponse.json({ action: "federate_identity", identity, success: true }, { status: 201 });
  }

  if (action === "verify_identity") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    verifyIdentity(id);
    return NextResponse.json({ action: "verify_identity", id, success: true });
  }

  if (action === "mark_capability_degraded") {
    const { agentName, reason } = body as Record<string, unknown>;
    if (!isAgentName(agentName)) {
      return NextResponse.json({ error: "agentName must be a registered agent" }, { status: 400 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    markCapabilityDegraded(agentName, reason);
    return NextResponse.json({ action: "mark_capability_degraded", agentName, success: true });
  }

  if (action === "delegate_task") {
    const { fromAgent, toAgent, taskType, payload, priority, traceId, jobId, userId } =
      body as Record<string, unknown>;

    if (!isAgentName(fromAgent) || !isAgentName(toAgent)) {
      return NextResponse.json(
        { error: "fromAgent and toAgent must be registered agents" },
        { status: 400 }
      );
    }
    if (!VALID_TASK_TYPES.includes(taskType as DelegationTaskType)) {
      return NextResponse.json(
        { error: `taskType must be one of: ${VALID_TASK_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof traceId !== "string" || traceId.trim() === "") {
      return NextResponse.json({ error: "traceId required" }, { status: 400 });
    }

    const resolvedPriority = VALID_PRIORITIES.includes(priority as (typeof VALID_PRIORITIES)[number])
      ? (priority as (typeof VALID_PRIORITIES)[number])
      : "medium";

    const result = await delegateTask({
      fromAgent,
      toAgent,
      taskType: taskType as DelegationTaskType,
      payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      context: {
        tenantId,
        traceId,
        ...(typeof jobId === "string" ? { jobId } : {}),
        ...(typeof userId === "string" ? { userId } : {}),
      },
      priority: resolvedPriority,
      traceId,
    });

    return NextResponse.json({ action: "delegate_task", delegation: result, success: true }, { status: 201 });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_node', 'update_node_status', 'create_route', 'suspend_route', 'federate_identity', 'verify_identity', 'mark_capability_degraded', or 'delegate_task'.`,
    },
    { status: 400 }
  );
}
