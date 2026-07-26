// GET  /api/admin/ecosystem-connectors — active connectors, rate-limited connectors, bridge stats, trust graph
// POST /api/admin/ecosystem-connectors — register_connector | record_call | update_status | bridge_event | mark_delivered | mark_failed | schedule_retry | record_interaction
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerConnector,
  recordCall,
  updateConnectorStatus,
  getActiveConnectors,
  getRateLimitedConnectors,
  type EcosystemConnector,
} from "@/lib/ecosystem-connectors/connector-registry";
import {
  bridgeEvent,
  markDelivered,
  markFailed,
  scheduleRetry,
  getPendingEvents,
  getBridgeStats,
} from "@/lib/ecosystem-connectors/event-bridge";
import {
  recordInteraction,
  getTrustScore,
  getTrustedSystems,
} from "@/lib/ecosystem-connectors/trust-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CONNECTOR_TYPES: EcosystemConnector["connectorType"][] = [
  "webhook", "api", "event_stream", "batch_sync", "realtime",
];
const VALID_AUTH_TYPES: EcosystemConnector["authType"][] = [
  "api_key", "oauth", "webhook_secret", "mutual_tls",
];
const VALID_STATUSES: EcosystemConnector["status"][] = ["active", "degraded", "inactive"];

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
  const fromSystem = url.searchParams.get("fromSystem");
  const toSystem = url.searchParams.get("toSystem");
  const targetSystem = url.searchParams.get("targetSystem") ?? undefined;
  const minTrustScore = parseInt(url.searchParams.get("minTrustScore") ?? "70", 10);

  const activeConnectors = getActiveConnectors();
  const rateLimitedConnectors = getRateLimitedConnectors();
  const bridgeStats = getBridgeStats();
  const pendingEvents = getPendingEvents(targetSystem);

  return NextResponse.json({
    connectors: {
      active: activeConnectors,
      rateLimited: rateLimitedConnectors,
    },
    eventBridge: {
      stats: bridgeStats,
      pendingEvents: pendingEvents.slice(0, 50),
    },
    trust: {
      ...(fromSystem && toSystem
        ? { score: getTrustScore(fromSystem, toSystem) }
        : {}),
      ...(fromSystem
        ? { trustedSystems: getTrustedSystems(fromSystem, minTrustScore) }
        : {}),
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

  if (action === "register_connector") {
    const { id, name, connectorType, targetSystem, authType, rateLimitPerMin } =
      body as Record<string, unknown>;

    if (typeof id !== "string" || typeof name !== "string" || typeof targetSystem !== "string") {
      return NextResponse.json({ error: "id, name, and targetSystem required" }, { status: 400 });
    }
    if (!VALID_CONNECTOR_TYPES.includes(connectorType as EcosystemConnector["connectorType"])) {
      return NextResponse.json(
        { error: `connectorType must be one of: ${VALID_CONNECTOR_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_AUTH_TYPES.includes(authType as EcosystemConnector["authType"])) {
      return NextResponse.json(
        { error: `authType must be one of: ${VALID_AUTH_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const connector = registerConnector(
      id,
      name,
      connectorType as EcosystemConnector["connectorType"],
      targetSystem,
      authType as EcosystemConnector["authType"],
      typeof rateLimitPerMin === "number" ? rateLimitPerMin : 60
    );
    return NextResponse.json({ action: "register_connector", connector, success: true }, { status: 201 });
  }

  if (action === "record_call") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const result = recordCall(id);
    return NextResponse.json({ action: "record_call", result, success: true });
  }

  if (action === "update_status") {
    const { id, status } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as EcosystemConnector["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updateConnectorStatus(id, status as EcosystemConnector["status"]);
    return NextResponse.json({ action: "update_status", id, status, success: true });
  }

  if (action === "bridge_event") {
    const { sourceSystem, targetSystem, eventType, payload } = body as Record<string, unknown>;
    if (
      typeof sourceSystem !== "string" ||
      typeof targetSystem !== "string" ||
      typeof eventType !== "string"
    ) {
      return NextResponse.json({ error: "sourceSystem, targetSystem, and eventType required" }, { status: 400 });
    }
    const event = bridgeEvent(
      sourceSystem,
      targetSystem,
      eventType,
      (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "bridge_event", event, success: true }, { status: 201 });
  }

  if (action === "mark_delivered") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    markDelivered(id);
    return NextResponse.json({ action: "mark_delivered", id, success: true });
  }

  if (action === "mark_failed") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    markFailed(id);
    return NextResponse.json({ action: "mark_failed", id, success: true });
  }

  if (action === "schedule_retry") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    scheduleRetry(id);
    return NextResponse.json({ action: "schedule_retry", id, success: true });
  }

  if (action === "record_interaction") {
    const { fromSystem, toSystem, success: interactionSuccess } = body as Record<string, unknown>;
    if (typeof fromSystem !== "string" || typeof toSystem !== "string") {
      return NextResponse.json({ error: "fromSystem and toSystem required" }, { status: 400 });
    }
    const edge = recordInteraction(fromSystem, toSystem, interactionSuccess !== false);
    return NextResponse.json({ action: "record_interaction", edge, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_connector', 'record_call', 'update_status', 'bridge_event', 'mark_delivered', 'mark_failed', 'schedule_retry', or 'record_interaction'.`,
    },
    { status: 400 }
  );
}
