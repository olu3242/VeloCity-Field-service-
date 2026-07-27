// GET  /api/admin/live-events — this tenant's live stream, pipeline metrics, active routes
// POST /api/admin/live-events — emit_event | mark_processed | stream_by_type | unprocessed
//                               | record_pipeline_event | pipeline_metric
//                               | register_route | route_event
// Admin-only. Live events carry an optional tenantId: tenant-scoped events stay private to
// their owner, platform-level events (no tenantId) are visible to all. Pipeline metrics and
// stream routes are shared infrastructure, so mutating them requires super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  emitLiveEvent,
  markProcessed,
  getStreamByType,
  getStreamByTenant,
  getUnprocessedEvents,
  getStreamStats,
  type LiveEvent,
} from "@/lib/live-events/event-stream";
import {
  recordPipelineEvent,
  getPipelineMetric,
  getAllPipelineMetrics,
  getHealthyPipelines,
} from "@/lib/live-events/pipeline-monitor";
import {
  registerRoute,
  routeEvent,
  getActiveRoutes,
  type StreamRoute,
} from "@/lib/live-events/stream-router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PRIORITIES: LiveEvent["priority"][] = ["low", "normal", "high", "critical"];
const VALID_DESTINATIONS: StreamRoute["destination"][] = [
  "queue", "telemetry", "alert", "log", "dead_letter",
];

const INFRA_ACTIONS = new Set(["register_route", "record_pipeline_event"]);

/** An event is visible if platform-level or owned by this tenant. */
function visible(event: LiveEvent, tenantId: string): boolean {
  return event.tenantId === undefined || event.tenantId === tenantId;
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
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  return NextResponse.json({
    stream: {
      recent: getStreamByTenant(tenantId, limit),
      // getStreamByType spans every tenant — filter to what this caller may see.
      ...(eventType
        ? { byType: getStreamByType(eventType, limit).filter((e) => visible(e, tenantId)) }
        : {}),
      unprocessed: getUnprocessedEvents().filter((e) => visible(e, tenantId)),
      // Stream stats are a platform-wide aggregate.
      ...(isSuperAdmin ? { platformStats: getStreamStats() } : {}),
    },
    pipelines: {
      all: getAllPipelineMetrics(),
      healthy: getHealthyPipelines(),
    },
    routes: {
      active: getActiveRoutes(),
    },
    supported: {
      priorities: VALID_PRIORITIES,
      destinations: VALID_DESTINATIONS,
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

  if (typeof action === "string" && INFRA_ACTIONS.has(action) && !isSuperAdmin) {
    return NextResponse.json(
      { error: `Forbidden — '${action}' alters shared stream infrastructure and requires super_admin` },
      { status: 403 }
    );
  }

  // ── Event stream ────────────────────────────────────────────────────────

  if (action === "emit_event") {
    const { eventType, source, payload, priority, platformWide } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (typeof source !== "string" || source.trim() === "") {
      return NextResponse.json({ error: "source required" }, { status: 400 });
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as LiveEvent["priority"])) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    // An event emitted without a tenantId is visible to every tenant, so that
    // must be a deliberate super_admin act rather than an omitted field.
    if (platformWide === true && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — platform-wide events require super_admin" },
        { status: 403 }
      );
    }
    const event = emitLiveEvent(
      eventType,
      source,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      (priority as LiveEvent["priority"]) ?? "normal",
      platformWide === true ? undefined : tenantId
    );
    return NextResponse.json(
      { action, event, route: routeEvent(eventType), success: true },
      { status: 201 }
    );
  }

  if (action === "mark_processed") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // markProcessed no-ops on an unknown id and carries no tenant check, so
    // ownership is confirmed against the unprocessed set first.
    const event = getUnprocessedEvents().find((e) => e.id === id);
    if (!event || !visible(event, tenantId)) {
      return NextResponse.json(
        { error: "Unprocessed event not found for this tenant" },
        { status: 404 }
      );
    }
    markProcessed(id);
    return NextResponse.json({
      action,
      id,
      unprocessed: getUnprocessedEvents().filter((e) => visible(e, tenantId)).length,
      success: true,
    });
  }

  if (action === "stream_by_type") {
    const { eventType, limit } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const capped = typeof limit === "number" ? Math.min(limit, 200) : 50;
    return NextResponse.json({
      action,
      events: getStreamByType(eventType, capped).filter((e) => visible(e, tenantId)),
      success: true,
    });
  }

  if (action === "unprocessed") {
    const { priority } = raw;
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as LiveEvent["priority"])) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action,
      events: getUnprocessedEvents(priority as LiveEvent["priority"] | undefined).filter((e) =>
        visible(e, tenantId)
      ),
      success: true,
    });
  }

  // ── Pipeline monitor ────────────────────────────────────────────────────

  if (action === "record_pipeline_event") {
    const { pipelineId, processingMs, isError } = raw;
    if (typeof pipelineId !== "string" || pipelineId.trim() === "") {
      return NextResponse.json({ error: "pipelineId required" }, { status: 400 });
    }
    if (typeof processingMs !== "number" || !Number.isFinite(processingMs) || processingMs < 0) {
      return NextResponse.json(
        { error: "processingMs must be a non-negative number" },
        { status: 400 }
      );
    }
    if (typeof isError !== "boolean") {
      return NextResponse.json({ error: "isError must be a boolean" }, { status: 400 });
    }
    recordPipelineEvent(pipelineId, processingMs, isError);
    return NextResponse.json(
      { action, metric: getPipelineMetric(pipelineId) ?? null, success: true },
      { status: 201 }
    );
  }

  if (action === "pipeline_metric") {
    const { pipelineId } = raw;
    if (typeof pipelineId !== "string") {
      return NextResponse.json({ error: "pipelineId required" }, { status: 400 });
    }
    const metric = getPipelineMetric(pipelineId);
    if (!metric) {
      // recordPipelineEvent creates a metric on first use, so a missing one
      // means the pipeline has genuinely never run.
      return NextResponse.json(
        { error: `No metrics recorded for pipeline '${pipelineId}'` },
        { status: 404 }
      );
    }
    return NextResponse.json({ action, metric, success: true });
  }

  // ── Stream router ───────────────────────────────────────────────────────

  if (action === "register_route") {
    const { eventType, destination, filter, priority, active } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!VALID_DESTINATIONS.includes(destination as StreamRoute["destination"])) {
      return NextResponse.json(
        { error: `destination must be one of: ${VALID_DESTINATIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as StreamRoute["priority"])) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    // Overwriting the 'default' route changes where every unmatched event goes.
    if (eventType === "default" && destination !== "log") {
      return NextResponse.json(
        {
          error:
            "Refusing to repoint the 'default' route — every unmatched event would follow it. Register a specific eventType instead.",
        },
        { status: 409 }
      );
    }
    const route: StreamRoute = {
      eventType,
      destination: destination as StreamRoute["destination"],
      priority: (priority as StreamRoute["priority"]) ?? "normal",
      active: active !== false,
      ...(typeof filter === "string" ? { filter } : {}),
    };
    registerRoute(route);
    return NextResponse.json({ action, route, success: true }, { status: 201 });
  }

  if (action === "route_event") {
    const { eventType } = raw;
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const route = routeEvent(eventType);
    return NextResponse.json({
      action,
      route,
      // routeEvent falls back to the default route rather than failing — say so
      // so a caller knows no specific route was configured.
      matchedSpecificRoute: route.eventType === eventType,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'emit_event', 'mark_processed', 'stream_by_type', 'unprocessed', 'record_pipeline_event', 'pipeline_metric', 'register_route', or 'route_event'.`,
    },
    { status: 400 }
  );
}
