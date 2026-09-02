// GET  /api/admin/e2e-workflow — workflow definitions, cycle metrics, phase validation
// POST /api/admin/e2e-workflow — validate | run | get_status | advance_phase
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateWorkflow } from "@/lib/workflows/dsl";
import {
  E2E_CIRCULAR_WORKFLOW_PHASES,
  type E2EPhaseId,
} from "@/lib/workflows/templates/e2e-circular-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── In-memory cycle state (resets on cold start; suitable for demo/ops view) ─
interface CycleRun {
  runId: string;
  tenantId: string;
  startedAt: string;
  currentPhaseIndex: number;
  currentPhaseId: E2EPhaseId;
  status: "running" | "paused" | "completed" | "failed";
  completedPhases: E2EPhaseId[];
  updatedAt: string;
}

const cycleRuns = new Map<string, CycleRun>();
let runCounter = 0;

function makeRunId(): string {
  runCounter += 1;
  return `e2e-run-${runCounter.toString().padStart(4, "0")}`;
}

const PHASE_IDS: E2EPhaseId[] = E2E_CIRCULAR_WORKFLOW_PHASES.map(
  (p) => p.id as E2EPhaseId
);

// ─── Auth helper ──────────────────────────────────────────────────────────────
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

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const phaseId = url.searchParams.get("phaseId");
  const runId = url.searchParams.get("runId");
  const withValidation = url.searchParams.get("validate") === "true";

  // Single phase detail
  if (phaseId) {
    const phase = E2E_CIRCULAR_WORKFLOW_PHASES.find((p) => p.id === phaseId);
    if (!phase) {
      return NextResponse.json(
        { error: `Phase '${phaseId}' not found. Valid ids: ${PHASE_IDS.join(", ")}` },
        { status: 404 }
      );
    }
    const validation = withValidation ? validateWorkflow(phase) : undefined;
    return NextResponse.json({ phase, ...(validation ? { validation } : {}), generatedAt: new Date().toISOString() });
  }

  // Specific run status
  if (runId) {
    const run = cycleRuns.get(runId);
    if (!run) {
      return NextResponse.json({ error: `Run '${runId}' not found` }, { status: 404 });
    }
    return NextResponse.json({ run, generatedAt: new Date().toISOString() });
  }

  // Summary view
  const phases = E2E_CIRCULAR_WORKFLOW_PHASES.map((p) => ({
    id: p.id,
    name: p.name,
    trigger: p.trigger.event,
    stepCount: p.steps.length,
    humanInTheLoop: p.humanInTheLoop,
    ...(withValidation ? { validation: validateWorkflow(p) } : {}),
  }));

  const runs = Array.from(cycleRuns.values()).slice(-20);

  const summary = {
    phaseCount: phases.length,
    circularLink: {
      phase1Trigger: E2E_CIRCULAR_WORKFLOW_PHASES[0].trigger.event,
      phase8LoopBackEvent: "platform_cycle_complete",
      description: "Phase 8 emits platform_cycle_complete → enriched context available for next service_request_created",
    },
    humanGates: phases.filter((p) => p.humanInTheLoop).map((p) => p.id),
    totalSteps: phases.reduce((acc, p) => acc + p.stepCount, 0),
  };

  return NextResponse.json({
    phases,
    summary,
    runs: {
      active: runs.filter((r) => r.status === "running"),
      recent: runs.slice(-10),
      total: cycleRuns.size,
    },
    generatedAt: new Date().toISOString(),
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId: string = auth.profile.tenant_id ?? "platform";

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

  // ── validate ──────────────────────────────────────────────────────────────
  if (action === "validate") {
    const results = E2E_CIRCULAR_WORKFLOW_PHASES.map((p) => ({
      id: p.id,
      name: p.name,
      ...validateWorkflow(p),
    }));
    const allValid = results.every((r) => r.valid);
    return NextResponse.json({ action: "validate", allValid, results, success: true });
  }

  // ── run ───────────────────────────────────────────────────────────────────
  if (action === "run") {
    const runId = makeRunId();
    const now = new Date().toISOString();
    const run: CycleRun = {
      runId,
      tenantId,
      startedAt: now,
      currentPhaseIndex: 0,
      currentPhaseId: PHASE_IDS[0],
      status: "running",
      completedPhases: [],
      updatedAt: now,
    };
    cycleRuns.set(runId, run);

    const currentPhase = E2E_CIRCULAR_WORKFLOW_PHASES[0];
    return NextResponse.json(
      {
        action: "run",
        runId,
        currentPhase: { id: currentPhase.id, name: currentPhase.name },
        trigger: currentPhase.trigger.event,
        success: true,
      },
      { status: 201 }
    );
  }

  // ── get_status ────────────────────────────────────────────────────────────
  if (action === "get_status") {
    const { runId } = body as Record<string, unknown>;
    if (typeof runId !== "string") {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }
    const run = cycleRuns.get(runId);
    if (!run) {
      return NextResponse.json({ error: `Run '${runId}' not found` }, { status: 404 });
    }
    const phaseIndex = run.currentPhaseIndex;
    const currentPhaseDef = E2E_CIRCULAR_WORKFLOW_PHASES[phaseIndex];
    return NextResponse.json({
      action: "get_status",
      run,
      currentPhaseDef: currentPhaseDef
        ? { id: currentPhaseDef.id, name: currentPhaseDef.name, stepCount: currentPhaseDef.steps.length }
        : null,
      progress: `${run.completedPhases.length} / ${PHASE_IDS.length} phases complete`,
      success: true,
    });
  }

  // ── advance_phase ─────────────────────────────────────────────────────────
  if (action === "advance_phase") {
    const { runId, markStatus } = body as Record<string, unknown>;
    if (typeof runId !== "string") {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }
    const run = cycleRuns.get(runId);
    if (!run) {
      return NextResponse.json({ error: `Run '${runId}' not found` }, { status: 404 });
    }
    if (run.status !== "running") {
      return NextResponse.json(
        { error: `Run '${runId}' is ${run.status} and cannot be advanced` },
        { status: 409 }
      );
    }

    const phaseStatus = markStatus === "failed" ? "failed" : "completed";

    if (phaseStatus === "failed") {
      run.status = "failed";
      run.updatedAt = new Date().toISOString();
      cycleRuns.set(runId, run);
      return NextResponse.json({ action: "advance_phase", runId, result: "run_failed", success: true });
    }

    run.completedPhases.push(run.currentPhaseId);

    const nextIndex = run.currentPhaseIndex + 1;

    if (nextIndex >= PHASE_IDS.length) {
      // Completed full cycle — loop-back: reset to phase 1 for next cycle
      run.status = "completed";
      run.currentPhaseIndex = PHASE_IDS.length - 1;
      run.updatedAt = new Date().toISOString();
      cycleRuns.set(runId, run);
      return NextResponse.json({
        action: "advance_phase",
        runId,
        result: "cycle_complete",
        loopBackEvent: "platform_cycle_complete",
        description: "Full E2E cycle completed. Platform intelligence will enrich the next Discovery phase.",
        completedPhases: run.completedPhases,
        success: true,
      });
    }

    run.currentPhaseIndex = nextIndex;
    run.currentPhaseId = PHASE_IDS[nextIndex];
    run.updatedAt = new Date().toISOString();
    cycleRuns.set(runId, run);

    const nextPhase = E2E_CIRCULAR_WORKFLOW_PHASES[nextIndex];
    return NextResponse.json({
      action: "advance_phase",
      runId,
      previousPhase: PHASE_IDS[nextIndex - 1],
      nextPhase: { id: nextPhase.id, name: nextPhase.name, trigger: nextPhase.trigger.event },
      progress: `${run.completedPhases.length} / ${PHASE_IDS.length}`,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'validate', 'run', 'get_status', or 'advance_phase'.`,
    },
    { status: 400 }
  );
}
