// GET  /api/admin/distributed-queues — queue fabric health, overflow queues, backpressure, routing stats
// POST /api/admin/distributed-queues — register_queue | update_metrics | evaluate_backpressure | record_shed | register_route | record_routing
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerQueue,
  updateQueueMetrics,
  getQueuesByRegion,
  getOverflowQueues,
  getQueueFabricHealth,
  type DistributedQueue,
} from "@/lib/distributed-queues/queue-fabric";
import {
  registerQueueRoute,
  resolveQueue,
  recordRouting,
  getRoutingStats,
  type QueueRoute,
} from "@/lib/distributed-queues/queue-router";
import {
  evaluateBackpressure,
  recordShed,
  getBackpressureStatus,
  getCriticalQueues,
} from "@/lib/distributed-queues/backpressure-controller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_QUEUE_TYPES: DistributedQueue["queueType"][] = [
  "primary", "priority", "dead_letter", "retry", "regional",
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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const region = url.searchParams.get("region");
  const eventType = url.searchParams.get("eventType");

  const fabricHealth = getQueueFabricHealth();
  const overflowQueues = getOverflowQueues();
  const backpressureStatus = getBackpressureStatus();
  const criticalQueues = getCriticalQueues();
  const routingStats = getRoutingStats();

  return NextResponse.json({
    fabric: {
      health: fabricHealth,
      overflow: overflowQueues,
      ...(region ? { byRegion: getQueuesByRegion(region) } : {}),
    },
    backpressure: {
      status: backpressureStatus,
      critical: criticalQueues,
    },
    routing: {
      stats: routingStats,
      ...(eventType ? { resolved: resolveQueue(eventType) } : {}),
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  if (action === "register_queue") {
    const { id, queueType, region, capacity } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof region !== "string") {
      return NextResponse.json({ error: "id and region required" }, { status: 400 });
    }
    if (!VALID_QUEUE_TYPES.includes(queueType as DistributedQueue["queueType"])) {
      return NextResponse.json(
        { error: `queueType must be one of: ${VALID_QUEUE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const queue = registerQueue(
      id,
      queueType as DistributedQueue["queueType"],
      region,
      typeof capacity === "number" ? capacity : 1000
    );
    return NextResponse.json({ action: "register_queue", queue, success: true }, { status: 201 });
  }

  if (action === "update_metrics") {
    const { id, depth, processingRate, errorRate } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (typeof depth !== "number" || typeof processingRate !== "number" || typeof errorRate !== "number") {
      return NextResponse.json({ error: "depth, processingRate, and errorRate required" }, { status: 400 });
    }
    updateQueueMetrics(id, depth, processingRate, errorRate);
    return NextResponse.json({ action: "update_metrics", id, success: true });
  }

  if (action === "evaluate_backpressure") {
    const { queueId, depth, capacity } = body as Record<string, unknown>;
    if (typeof queueId !== "string" || typeof depth !== "number" || typeof capacity !== "number") {
      return NextResponse.json({ error: "queueId, depth, and capacity required" }, { status: 400 });
    }
    const state = evaluateBackpressure(queueId, depth, capacity);
    return NextResponse.json({ action: "evaluate_backpressure", state, success: true });
  }

  if (action === "record_shed") {
    const { queueId } = body as Record<string, unknown>;
    if (typeof queueId !== "string") {
      return NextResponse.json({ error: "queueId required" }, { status: 400 });
    }
    recordShed(queueId);
    return NextResponse.json({ action: "record_shed", queueId, success: true });
  }

  if (action === "register_route") {
    const { eventType, primaryQueueId, fallbackQueueId, priorityBoost } = body as Record<string, unknown>;
    if (typeof eventType !== "string" || typeof primaryQueueId !== "string") {
      return NextResponse.json({ error: "eventType and primaryQueueId required" }, { status: 400 });
    }
    const route: QueueRoute = {
      eventType,
      primaryQueueId,
      fallbackQueueId: typeof fallbackQueueId === "string" ? fallbackQueueId : undefined,
      priorityBoost: priorityBoost === true,
    };
    registerQueueRoute(route);
    return NextResponse.json({ action: "register_route", route, success: true }, { status: 201 });
  }

  if (action === "record_routing") {
    const { eventType } = body as Record<string, unknown>;
    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    recordRouting(eventType);
    return NextResponse.json({ action: "record_routing", eventType, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_queue', 'update_metrics', 'evaluate_backpressure', 'record_shed', 'register_route', or 'record_routing'.`,
    },
    { status: 400 }
  );
}
