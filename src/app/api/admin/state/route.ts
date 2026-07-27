// GET  /api/admin/state — this tenant's workflow states, transition history, snapshots
// POST /api/admin/state — create_workflow | update_workflow | record_transition
//                         | check_transition | take_snapshot | restore_snapshot
// Admin-only. Workflow states, transitions, and snapshots all carry a tenantId and are
// strictly guarded to the caller's tenant — tenantId is never read from the request body.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { isRuntimePaused } from "@/lib/governance/operator";
import {
  createWorkflowState,
  updateWorkflowState,
  getWorkflowState,
  getWorkflowsByTenant,
  getWorkflowsByStatus,
  type WorkflowState,
} from "@/lib/state/workflow-state";
import {
  isValidTransition,
  recordTransition,
  getTransitionHistory,
  getInvalidTransitions,
} from "@/lib/state/state-transitions";
import {
  takeSnapshot,
  getSnapshots,
  getLatestSnapshot,
  restoreFromSnapshot,
} from "@/lib/state/state-snapshots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES: WorkflowState["status"][] = [
  "pending", "running", "completed", "failed", "paused",
];

// Every mutating path here is a no-op or records an invalid entry while the
// runtime is paused, so the pause is checked up-front and reported as 409.
const PAUSE_SENSITIVE = new Set(["update_workflow", "record_transition"]);

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

// Resolves a workflow only if it belongs to this tenant.
function ownedWorkflow(id: string, tenantId: string): WorkflowState | undefined {
  const workflow = getWorkflowState(id);
  if (!workflow || workflow.tenantId !== tenantId) return undefined;
  return workflow;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");
  const status = url.searchParams.get("status") as WorkflowState["status"] | null;

  const owned = workflowId ? ownedWorkflow(workflowId, tenantId) : undefined;

  return NextResponse.json({
    workflows: {
      all: getWorkflowsByTenant(tenantId),
      ...(status && VALID_STATUSES.includes(status)
        ? {
            // Cross-tenant status query is filtered back down to this tenant.
            byStatus: getWorkflowsByStatus(status).filter((w) => w.tenantId === tenantId),
          }
        : {}),
      ...(workflowId ? { workflow: owned ?? null } : {}),
    },
    transitions: {
      // Invalid transitions are a tenant-scoped audit signal, not a global one.
      invalid: getInvalidTransitions().filter((t) => t.tenantId === tenantId),
      ...(owned ? { history: getTransitionHistory(owned.id) } : {}),
    },
    snapshots: owned
      ? { all: getSnapshots(owned.id), latest: getLatestSnapshot(owned.id) ?? null }
      : {},
    runtimePaused: isRuntimePaused(),
    supportedStatuses: VALID_STATUSES,
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

  if (typeof action === "string" && PAUSE_SENSITIVE.has(action) && isRuntimePaused()) {
    return NextResponse.json(
      {
        error: `Runtime is paused — '${action}' would be silently discarded. Resume the runtime before retrying.`,
        runtimePaused: true,
      },
      { status: 409 }
    );
  }

  if (action === "create_workflow") {
    const { workflowType, totalSteps, metadata } = raw;
    if (typeof workflowType !== "string" || workflowType.trim() === "") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    if (typeof totalSteps !== "number" || !Number.isInteger(totalSteps) || totalSteps < 1) {
      return NextResponse.json({ error: "totalSteps must be a positive integer" }, { status: 400 });
    }
    const workflow = createWorkflowState(
      workflowType,
      tenantId,
      totalSteps,
      metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "create_workflow", workflow, success: true }, { status: 201 });
  }

  if (action === "update_workflow") {
    const { id, status, currentStep, metadata } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const workflow = ownedWorkflow(id, tenantId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found for this tenant" }, { status: 404 });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status as WorkflowState["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // A status change must follow the state machine — otherwise the workflow row
    // and its transition log would disagree about what is legal.
    if (status !== undefined && status !== workflow.status) {
      if (!isValidTransition(workflow.status, status as WorkflowState["status"])) {
        return NextResponse.json(
          { error: `Invalid transition: ${workflow.status} → ${status}` },
          { status: 409 }
        );
      }
    }
    if (currentStep !== undefined) {
      if (typeof currentStep !== "number" || !Number.isInteger(currentStep) || currentStep < 0) {
        return NextResponse.json({ error: "currentStep must be a non-negative integer" }, { status: 400 });
      }
      if (currentStep > workflow.totalSteps) {
        return NextResponse.json(
          { error: `currentStep cannot exceed totalSteps (${workflow.totalSteps})` },
          { status: 400 }
        );
      }
    }

    updateWorkflowState(id, {
      ...(status !== undefined ? { status: status as WorkflowState["status"] } : {}),
      ...(typeof currentStep === "number" ? { currentStep } : {}),
      ...(metadata && typeof metadata === "object"
        ? { metadata: metadata as Record<string, unknown> }
        : {}),
    });
    return NextResponse.json({
      action: "update_workflow",
      workflow: getWorkflowState(id) ?? null,
      success: true,
    });
  }

  if (action === "record_transition") {
    const { workflowId, toStatus, triggeredBy } = raw;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    const workflow = ownedWorkflow(workflowId, tenantId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found for this tenant" }, { status: 404 });
    }
    if (!VALID_STATUSES.includes(toStatus as WorkflowState["status"])) {
      return NextResponse.json(
        { error: `toStatus must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof triggeredBy !== "string" || triggeredBy.trim() === "") {
      return NextResponse.json({ error: "triggeredBy required for audit trail" }, { status: 400 });
    }
    // fromStatus is read from the stored workflow, never the body — a caller
    // cannot fabricate a legal-looking transition from a status it was never in.
    const transition = recordTransition(
      workflowId,
      tenantId,
      workflow.status,
      toStatus as WorkflowState["status"],
      triggeredBy
    );
    // Invalid transitions are still recorded for audit, but the caller is told.
    return NextResponse.json(
      { action: "record_transition", transition, success: transition.valid },
      { status: transition.valid ? 201 : 409 }
    );
  }

  if (action === "check_transition") {
    const { fromStatus, toStatus } = raw;
    if (!VALID_STATUSES.includes(fromStatus as WorkflowState["status"])) {
      return NextResponse.json(
        { error: `fromStatus must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(toStatus as WorkflowState["status"])) {
      return NextResponse.json(
        { error: `toStatus must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "check_transition",
      valid: isValidTransition(
        fromStatus as WorkflowState["status"],
        toStatus as WorkflowState["status"]
      ),
      success: true,
    });
  }

  if (action === "take_snapshot") {
    const { workflowId, step, state, reason } = raw;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    const workflow = ownedWorkflow(workflowId, tenantId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found for this tenant" }, { status: 404 });
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const snapshot = takeSnapshot(
      workflowId,
      tenantId,
      typeof step === "number" ? step : workflow.currentStep,
      state && typeof state === "object" ? (state as Record<string, unknown>) : {},
      reason
    );
    return NextResponse.json({ action: "take_snapshot", snapshot, success: true }, { status: 201 });
  }

  if (action === "restore_snapshot") {
    const { workflowId, snapshotId } = raw;
    if (typeof workflowId !== "string" || typeof snapshotId !== "string") {
      return NextResponse.json({ error: "workflowId and snapshotId required" }, { status: 400 });
    }
    if (!ownedWorkflow(workflowId, tenantId)) {
      return NextResponse.json({ error: "Workflow not found for this tenant" }, { status: 404 });
    }
    const snapshot = restoreFromSnapshot(workflowId, snapshotId);
    if (!snapshot) {
      return NextResponse.json({ error: `Unknown snapshotId: ${snapshotId}` }, { status: 404 });
    }
    // restoreFromSnapshot reads the snapshot; it does not write it back onto the
    // workflow. The caller receives the captured state to apply deliberately.
    return NextResponse.json({
      action: "restore_snapshot",
      snapshot,
      note: "Snapshot returned for inspection — workflow state was not overwritten.",
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'create_workflow', 'update_workflow', 'record_transition', 'check_transition', 'take_snapshot', or 'restore_snapshot'.`,
    },
    { status: 400 }
  );
}
