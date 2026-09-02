// GET  /api/admin/orchestration — worker health, event bus stats, recent events
// POST /api/admin/orchestration — register_worker | heartbeat | assign_workload | deregister_stale | register_channel | ingest_event
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerWorker,
  heartbeat,
  assignWorkload,
  getWorkerHealth,
  deregisterStaleWorkers,
  type WorkerNode,
} from "@/lib/orchestration/distributed-fabric";
import {
  registerChannelMapping,
  ingestExternalEvent,
  getEventBusStats,
  getRecentEvents,
  type ExternalEvent,
} from "@/lib/orchestration/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_REGIONS: WorkerNode["region"][] = [
  "us-east", "us-west", "eu-west", "ap-southeast", "local",
];
const VALID_CHANNELS: ExternalEvent["channel"][] = [
  "internal", "stripe", "partner", "analytics", "crm", "erp",
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
  const eventLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const workerHealth = getWorkerHealth();
  const eventBusStats = getEventBusStats();
  const recentEvents = getRecentEvents(eventLimit);

  return NextResponse.json({
    workers: workerHealth,
    eventBus: {
      stats: eventBusStats,
      recentEvents,
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

  if (action === "register_worker") {
    const { workerId, region, status, currentLoad, capabilities } =
      body as Record<string, unknown>;

    if (typeof workerId !== "string") {
      return NextResponse.json({ error: "workerId required" }, { status: 400 });
    }
    if (!VALID_REGIONS.includes(region as WorkerNode["region"])) {
      return NextResponse.json(
        { error: `region must be one of: ${VALID_REGIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const worker = registerWorker({
      workerId,
      region: region as WorkerNode["region"],
      status: (["idle", "processing", "overloaded", "offline"].includes(status as string)
        ? status : "idle") as WorkerNode["status"],
      currentLoad: typeof currentLoad === "number" ? currentLoad : 0,
      capabilities: Array.isArray(capabilities) ? (capabilities as string[]) : [],
    });
    return NextResponse.json({ action: "register_worker", worker, success: true }, { status: 201 });
  }

  if (action === "heartbeat") {
    const { workerId, load } = body as Record<string, unknown>;
    if (typeof workerId !== "string" || typeof load !== "number") {
      return NextResponse.json({ error: "workerId and load required" }, { status: 400 });
    }
    heartbeat(workerId, load);
    return NextResponse.json({ action: "heartbeat", workerId, success: true });
  }

  if (action === "assign_workload") {
    const { eventType, payload, priority } = body as Record<string, unknown>;
    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const assignment = assignWorkload(
      eventType,
      (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {},
      typeof priority === "number" ? priority : 5
    );
    return NextResponse.json({ action: "assign_workload", assignment, assigned: assignment !== null, success: true });
  }

  if (action === "deregister_stale") {
    const { maxSilenceMs } = body as Record<string, unknown>;
    const count = deregisterStaleWorkers(
      typeof maxSilenceMs === "number" ? maxSilenceMs : undefined
    );
    return NextResponse.json({ action: "deregister_stale", removed: count, success: true });
  }

  if (action === "register_channel") {
    const { externalType, internalType } = body as Record<string, unknown>;
    if (typeof externalType !== "string" || typeof internalType !== "string") {
      return NextResponse.json({ error: "externalType and internalType required" }, { status: 400 });
    }
    registerChannelMapping(externalType, internalType);
    return NextResponse.json({ action: "register_channel", externalType, internalType, success: true });
  }

  if (action === "ingest_event") {
    const { externalId, channel, eventType, source, payload, tenantId } =
      body as Record<string, unknown>;

    if (typeof externalId !== "string" || typeof eventType !== "string" || typeof source !== "string") {
      return NextResponse.json({ error: "externalId, eventType, and source required" }, { status: 400 });
    }
    if (!VALID_CHANNELS.includes(channel as ExternalEvent["channel"])) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await ingestExternalEvent({
      externalId,
      channel: channel as ExternalEvent["channel"],
      eventType,
      source,
      payload: (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {},
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
    });
    return NextResponse.json({ action: "ingest_event", result, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_worker', 'heartbeat', 'assign_workload', 'deregister_stale', 'register_channel', or 'ingest_event'.`,
    },
    { status: 400 }
  );
}
