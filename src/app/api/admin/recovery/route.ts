// GET  /api/admin/recovery — recovery queue, rollback points, replay sessions, worker failovers
// POST /api/admin/recovery — add_to_recovery | recover_item | discard_item | capture_rollback_point
//                            | execute_rollback | start_replay | record_replay_result | complete_replay
//                            | record_worker_failover | resolve_failover
// Admin-only; tenant-scoped. Recovery-queue reads and item mutations are bound to the caller's tenant.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  addToRecovery,
  recoverItem,
  getRecoveryQueue,
  getRecoveryStats,
  discardRecoveryItem,
  type RecoveryAction,
} from "@/lib/recovery/queue-recovery";
import {
  captureRollbackPoint,
  executeRollback,
  getAvailableRollbackPoints,
  getRecentRollbacks,
} from "@/lib/recovery/operational-rollback";
import {
  startReplaySession,
  recordReplayResult,
  completeReplaySession,
  getActiveSession,
  getSessionHistory,
} from "@/lib/recovery/replay-recovery";
import {
  recordWorkerFailover,
  resolveFailover,
  getActiveFailovers,
  getFailoverHistory,
  getAvgRecoveryMs,
} from "@/lib/recovery/worker-failover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_RECOVERY_ACTIONS: RecoveryAction[] = ["replay", "discard", "requeue", "escalate"];
const VALID_REPLAY_STATUSES = ["completed", "failed", "cancelled"] as const;

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    queue: {
      pending: getRecoveryQueue(tenantId),
      stats: getRecoveryStats(),
    },
    rollback: {
      available: getAvailableRollbackPoints(),
      recent: getRecentRollbacks(limit),
    },
    replay: {
      active: getActiveSession() ?? null,
      history: getSessionHistory(limit),
    },
    failover: {
      active: getActiveFailovers(),
      history: getFailoverHistory(limit),
      avgRecoveryMs: getAvgRecoveryMs(),
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

  if (action === "add_to_recovery") {
    const { originalEventId, eventType, payload, error, attempts } = body as Record<string, unknown>;
    if (typeof originalEventId !== "string" || typeof eventType !== "string") {
      return NextResponse.json(
        { error: "originalEventId and eventType required" },
        { status: 400 }
      );
    }
    if (typeof error !== "string" || error.trim() === "") {
      return NextResponse.json({ error: "error description required" }, { status: 400 });
    }
    const item = addToRecovery({
      originalEventId,
      eventType,
      tenantId,
      payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      error,
      attempts: typeof attempts === "number" ? attempts : 0,
    });
    return NextResponse.json({ action: "add_to_recovery", item, success: true }, { status: 201 });
  }

  if (action === "recover_item" || action === "discard_item") {
    const { id, recoveryAction, reason } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Tenant guard — only pending items owned by this tenant may be acted on.
    if (!getRecoveryQueue(tenantId).some((i) => i.id === id)) {
      return NextResponse.json(
        { error: "Recovery item not found for this tenant or already recovered" },
        { status: 404 }
      );
    }

    if (action === "discard_item") {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required to discard" }, { status: 400 });
      }
      discardRecoveryItem(id, reason);
      return NextResponse.json({
        action: "discard_item",
        id,
        stats: getRecoveryStats(),
        success: true,
      });
    }

    if (!VALID_RECOVERY_ACTIONS.includes(recoveryAction as RecoveryAction)) {
      return NextResponse.json(
        { error: `recoveryAction must be one of: ${VALID_RECOVERY_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    await recoverItem(id, recoveryAction as RecoveryAction);
    return NextResponse.json({
      action: "recover_item",
      id,
      recoveryAction,
      stats: getRecoveryStats(),
      success: true,
    });
  }

  if (action === "capture_rollback_point") {
    const { label, configSnapshot, triggerCondition } = body as Record<string, unknown>;
    if (typeof label !== "string" || label.trim() === "") {
      return NextResponse.json({ error: "label required" }, { status: 400 });
    }
    if (!configSnapshot || typeof configSnapshot !== "object") {
      return NextResponse.json({ error: "configSnapshot object required" }, { status: 400 });
    }
    const point = captureRollbackPoint(
      label,
      configSnapshot as Record<string, unknown>,
      typeof triggerCondition === "string" ? triggerCondition : undefined
    );
    return NextResponse.json({ action: "capture_rollback_point", point, success: true }, { status: 201 });
  }

  if (action === "execute_rollback") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const result = executeRollback(id);
    // A paused runtime or missing point is a governance/precondition failure, not a server error.
    return NextResponse.json(
      { action: "execute_rollback", result, success: result.success },
      { status: result.success ? 200 : 409 }
    );
  }

  if (action === "start_replay") {
    const { description, eventTypes } = body as Record<string, unknown>;
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      return NextResponse.json({ error: "eventTypes must be a non-empty array" }, { status: 400 });
    }
    if (getActiveSession()) {
      return NextResponse.json(
        { error: "A replay session is already running — complete it before starting another" },
        { status: 409 }
      );
    }
    const session = startReplaySession(description, eventTypes as string[], tenantId);
    return NextResponse.json({ action: "start_replay", session, success: true }, { status: 201 });
  }

  if (action === "record_replay_result") {
    const { sessionId, replaySucceeded } = body as Record<string, unknown>;
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    if (typeof replaySucceeded !== "boolean") {
      return NextResponse.json({ error: "replaySucceeded must be a boolean" }, { status: 400 });
    }
    recordReplayResult(sessionId, replaySucceeded);
    return NextResponse.json({
      action: "record_replay_result",
      sessionId,
      active: getActiveSession() ?? null,
      success: true,
    });
  }

  if (action === "complete_replay") {
    const { sessionId, status } = body as Record<string, unknown>;
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    if (!VALID_REPLAY_STATUSES.includes(status as (typeof VALID_REPLAY_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_REPLAY_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    completeReplaySession(sessionId, status as (typeof VALID_REPLAY_STATUSES)[number]);
    return NextResponse.json({ action: "complete_replay", sessionId, status, success: true });
  }

  if (action === "record_worker_failover") {
    const { failedWorkerId, redistributedTo, affectedQueueDepth } = body as Record<string, unknown>;
    if (typeof failedWorkerId !== "string" || failedWorkerId.trim() === "") {
      return NextResponse.json({ error: "failedWorkerId required" }, { status: 400 });
    }
    if (!Array.isArray(redistributedTo)) {
      return NextResponse.json({ error: "redistributedTo must be an array" }, { status: 400 });
    }
    const event = recordWorkerFailover(
      failedWorkerId,
      redistributedTo as string[],
      typeof affectedQueueDepth === "number" ? affectedQueueDepth : 0
    );
    return NextResponse.json({ action: "record_worker_failover", event, success: true }, { status: 201 });
  }

  if (action === "resolve_failover") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!getActiveFailovers().some((e) => e.id === id)) {
      return NextResponse.json({ error: `No active failover with id: ${id}` }, { status: 404 });
    }
    resolveFailover(id);
    return NextResponse.json({
      action: "resolve_failover",
      id,
      avgRecoveryMs: getAvgRecoveryMs(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'add_to_recovery', 'recover_item', 'discard_item', 'capture_rollback_point', 'execute_rollback', 'start_replay', 'record_replay_result', 'complete_replay', 'record_worker_failover', or 'resolve_failover'.`,
    },
    { status: 400 }
  );
}
