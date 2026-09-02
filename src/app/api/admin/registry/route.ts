// GET /api/admin/registry — canonical architecture registry: events, runtimes, workflows
// Admin-only; tenant-scoped.
//
// Read-only by design. The registries are compile-time source-of-truth constants that
// describe platform architecture, not mutable runtime state — there is no write path to
// expose. Cross-registry coverage analysis is derived here at request time.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  EVENT_REGISTRY,
  getOrphanedEvents,
  getEventsByStatus,
  type EventStatus,
} from "@/lib/registry/events";
import {
  RUNTIME_REGISTRY,
  getRuntimeById,
  getRuntimesByStatus,
  getOverallArchitectureScore,
  type RuntimeStatus,
} from "@/lib/registry/runtimes";
import {
  WORKFLOW_REGISTRY,
  type WorkflowStatus,
} from "@/lib/registry/workflows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_EVENT_STATUSES: EventStatus[] = ["active", "orphaned", "deprecated"];
const VALID_RUNTIME_STATUSES: RuntimeStatus[] = ["active", "partial", "orphaned", "planned"];
const VALID_WORKFLOW_STATUSES: WorkflowStatus[] = ["active", "partial", "planned"];

function countBy<T, K extends string>(items: T[], key: (item: T) => K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Cross-registry coverage analysis.
 *
 * Surfaces architectural gaps that no single registry can show on its own:
 * events a workflow references but the event registry does not define, events
 * with no consumer wired up, and runtimes no workflow actually exercises.
 */
function buildCoverageAnalysis() {
  const definedEventTypes = new Set(EVENT_REGISTRY.map((e) => e.type));
  const workflowEventTypes = new Set(WORKFLOW_REGISTRY.flatMap((w) => w.events));
  const workflowRuntimeIds = new Set(WORKFLOW_REGISTRY.flatMap((w) => w.runtimes));

  const undefinedInWorkflows = Array.from(workflowEventTypes).filter(
    (type) => !definedEventTypes.has(type)
  );
  const eventsNotUsedByWorkflows = Array.from(definedEventTypes).filter(
    (type) => !workflowEventTypes.has(type)
  );
  const eventsWithoutConsumers = EVENT_REGISTRY.filter((e) => e.consumers.length === 0).map(
    (e) => e.type
  );
  const runtimesNotUsedByWorkflows = RUNTIME_REGISTRY.filter(
    (r) => !workflowRuntimeIds.has(r.id)
  ).map((r) => r.id);
  const eventsWithoutDeadLetter = EVENT_REGISTRY.filter(
    (e) => e.status === "active" && !e.dead_letter
  ).map((e) => e.type);

  return {
    undefinedInWorkflows,
    eventsNotUsedByWorkflows,
    eventsWithoutConsumers,
    runtimesNotUsedByWorkflows,
    eventsWithoutDeadLetter,
    isFullyCovered:
      undefinedInWorkflows.length === 0 &&
      eventsWithoutConsumers.length === 0 &&
      runtimesNotUsedByWorkflows.length === 0,
  };
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
  const runtimeId = url.searchParams.get("runtimeId");
  const eventStatus = url.searchParams.get("eventStatus") as EventStatus | null;
  const runtimeStatus = url.searchParams.get("runtimeStatus") as RuntimeStatus | null;
  const workflowStatus = url.searchParams.get("workflowStatus") as WorkflowStatus | null;

  return NextResponse.json({
    events: {
      all: EVENT_REGISTRY,
      orphaned: getOrphanedEvents(),
      byStatusCount: countBy(EVENT_REGISTRY, (e) => e.status),
      ...(eventStatus && VALID_EVENT_STATUSES.includes(eventStatus)
        ? { filtered: getEventsByStatus(eventStatus) }
        : {}),
    },
    runtimes: {
      all: RUNTIME_REGISTRY,
      architectureScore: getOverallArchitectureScore(),
      byStatusCount: countBy(RUNTIME_REGISTRY, (r) => r.status),
      ...(runtimeId ? { runtime: getRuntimeById(runtimeId) ?? null } : {}),
      ...(runtimeStatus && VALID_RUNTIME_STATUSES.includes(runtimeStatus)
        ? { filtered: getRuntimesByStatus(runtimeStatus) }
        : {}),
    },
    workflows: {
      all: WORKFLOW_REGISTRY,
      byStatusCount: countBy(WORKFLOW_REGISTRY, (w) => w.status),
      ...(workflowStatus && VALID_WORKFLOW_STATUSES.includes(workflowStatus)
        ? { filtered: WORKFLOW_REGISTRY.filter((w) => w.status === workflowStatus) }
        : {}),
    },
    coverage: buildCoverageAnalysis(),
    totals: {
      events: EVENT_REGISTRY.length,
      runtimes: RUNTIME_REGISTRY.length,
      workflows: WORKFLOW_REGISTRY.length,
    },
    generatedAt: new Date().toISOString(),
  });
}
