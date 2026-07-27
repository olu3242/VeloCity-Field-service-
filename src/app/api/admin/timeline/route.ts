// GET  /api/admin/timeline — recent events for this tenant, timeline stats, entity timeline
// POST /api/admin/timeline — record_event | get_timeline | add_dispute_entry | dispute_summary
//                            | record_decision | agent_decisions | confidence_trend
// Admin-only. Timeline entries carry a tenantId and every read is filtered to the caller's
// tenant — including dispute timelines, whose lib accessor does not filter by tenant itself.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordEvent,
  getTimeline,
  getRecentEvents,
  getTimelineStats,
  type TimelineEntityType,
} from "@/lib/timeline/event-chronology";
import {
  addDisputeEntry,
  getDisputeTimeline,
  getDisputeDurationMs,
  getDisputeSummary,
} from "@/lib/timeline/dispute-timeline";
import {
  recordDecision,
  getDecisionsByAgent,
  getConfidenceTrend,
  getDecisionStats,
} from "@/lib/timeline/ai-decision-timeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ENTITY_TYPES: TimelineEntityType[] = [
  "dispute", "job", "payout", "provider", "customer", "workflow",
];

/**
 * getDisputeTimeline() returns every entry for a dispute id regardless of tenant —
 * the lib has no tenant parameter. Entries do carry tenantId, so isolation is
 * enforced here rather than trusting the accessor.
 */
function ownedDisputeTimeline(disputeId: string, tenantId: string) {
  return getDisputeTimeline(disputeId).filter((e) => e.tenantId === tenantId);
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
  const entityType = url.searchParams.get("entityType") as TimelineEntityType | null;
  const entityId = url.searchParams.get("entityId");
  const agentName = url.searchParams.get("agentName");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    events: {
      recent: getRecentEvents(tenantId, limit),
      // Stats are platform-wide aggregates with no per-entry detail.
      stats: getTimelineStats(),
      ...(entityType && VALID_ENTITY_TYPES.includes(entityType) && entityId
        ? { timeline: getTimeline(entityType, entityId, tenantId) }
        : {}),
    },
    aiDecisions: agentName
      ? {
          recent: getDecisionsByAgent(agentName, limit),
          trend: getConfidenceTrend(agentName),
          stats: getDecisionStats(agentName),
        }
      : {},
    supportedEntityTypes: VALID_ENTITY_TYPES,
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

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Event chronology ────────────────────────────────────────────────────

  if (action === "record_event") {
    const { entityType, entityId, eventType, description, actor, metadata } = raw;
    if (!VALID_ENTITY_TYPES.includes(entityType as TimelineEntityType)) {
      return NextResponse.json(
        { error: `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof entityId !== "string" || entityId.trim() === "") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || eventType.trim() === "") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    const event = recordEvent({
      entityType: entityType as TimelineEntityType,
      entityId,
      // Always the caller's tenant — a forged tenantId would place an entry
      // into another tenant's timeline.
      tenantId,
      eventType,
      description,
      timestamp: new Date().toISOString(),
      ...(typeof actor === "string" ? { actor } : {}),
      metadata:
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "record_event", event, success: true }, { status: 201 });
  }

  if (action === "get_timeline") {
    const { entityType, entityId } = raw;
    if (!VALID_ENTITY_TYPES.includes(entityType as TimelineEntityType)) {
      return NextResponse.json(
        { error: `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof entityId !== "string" || entityId.trim() === "") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "get_timeline",
      timeline: getTimeline(entityType as TimelineEntityType, entityId, tenantId),
      success: true,
    });
  }

  // ── Dispute timeline ────────────────────────────────────────────────────

  if (action === "add_dispute_entry") {
    const { disputeId, phase, disputeAction, performedBy, notes } = raw;
    if (typeof disputeId !== "string" || disputeId.trim() === "") {
      return NextResponse.json({ error: "disputeId required" }, { status: 400 });
    }
    if (typeof phase !== "string" || phase.trim() === "") {
      return NextResponse.json({ error: "phase required" }, { status: 400 });
    }
    if (typeof disputeAction !== "string" || disputeAction.trim() === "") {
      return NextResponse.json({ error: "disputeAction required" }, { status: 400 });
    }
    if (typeof performedBy !== "string" || performedBy.trim() === "") {
      return NextResponse.json({ error: "performedBy required for audit trail" }, { status: 400 });
    }
    // If the dispute already has entries, they must belong to this tenant —
    // otherwise a caller could append to another tenant's dispute history.
    const existing = getDisputeTimeline(disputeId);
    if (existing.length > 0 && !existing.some((e) => e.tenantId === tenantId)) {
      return NextResponse.json(
        { error: "Dispute timeline belongs to a different tenant" },
        { status: 404 }
      );
    }
    addDisputeEntry({
      disputeId,
      tenantId,
      phase,
      action: disputeAction,
      performedBy,
      timestamp: new Date().toISOString(),
      ...(typeof notes === "string" ? { notes } : {}),
    });
    return NextResponse.json(
      {
        action: "add_dispute_entry",
        timeline: ownedDisputeTimeline(disputeId, tenantId),
        success: true,
      },
      { status: 201 }
    );
  }

  if (action === "dispute_summary") {
    const { disputeId } = raw;
    if (typeof disputeId !== "string" || disputeId.trim() === "") {
      return NextResponse.json({ error: "disputeId required" }, { status: 400 });
    }
    const owned = ownedDisputeTimeline(disputeId, tenantId);
    if (owned.length === 0) {
      return NextResponse.json(
        { error: "Dispute timeline not found for this tenant" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      action: "dispute_summary",
      timeline: owned,
      summary: getDisputeSummary(disputeId),
      durationMs: getDisputeDurationMs(disputeId),
      success: true,
    });
  }

  // ── AI decision timeline ────────────────────────────────────────────────

  if (action === "record_decision") {
    const { agentName, eventType, decision, confidence, processingMs, contextKeys } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || typeof decision !== "string") {
      return NextResponse.json({ error: "eventType and decision required" }, { status: 400 });
    }
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
      return NextResponse.json({ error: "confidence must be a number" }, { status: 400 });
    }
    const entry = recordDecision({
      agentName,
      tenantId,
      eventType,
      decision,
      confidence,
      timestamp: new Date().toISOString(),
      processingMs: typeof processingMs === "number" ? processingMs : 0,
      contextKeys: Array.isArray(contextKeys) ? (contextKeys as string[]) : [],
    });
    return NextResponse.json({ action: "record_decision", entry, success: true }, { status: 201 });
  }

  if (action === "agent_decisions" || action === "confidence_trend") {
    const { agentName, limit } = raw;
    if (typeof agentName !== "string" || agentName.trim() === "") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }

    if (action === "confidence_trend") {
      return NextResponse.json({
        action: "confidence_trend",
        agentName,
        trend: getConfidenceTrend(agentName),
        stats: getDecisionStats(agentName),
        success: true,
      });
    }

    const capped = typeof limit === "number" ? Math.min(limit, 100) : 20;
    return NextResponse.json({
      action: "agent_decisions",
      agentName,
      // Agent decisions are recorded with a tenantId; filter so one tenant does
      // not read another's decision history through a shared agent name.
      decisions: getDecisionsByAgent(agentName, capped).filter(
        (d) => d.tenantId === undefined || d.tenantId === tenantId
      ),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'record_event', 'get_timeline', 'add_dispute_entry', 'dispute_summary', 'record_decision', 'agent_decisions', or 'confidence_trend'.`,
    },
    { status: 400 }
  );
}
