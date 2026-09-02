// GET  /api/admin/orchestration-resilience — active checkpoints, degraded status, failover history
// POST /api/admin/orchestration-resilience — save_checkpoint | load_checkpoint | mark_resumed | expire_checkpoints | activate_degraded | deactivate_degraded | resolve_failover | register_failover_rule
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  saveCheckpoint,
  loadCheckpoint,
  markResumed,
  expireCheckpoints,
  getActiveCheckpoints,
} from "@/lib/orchestration-resilience/checkpoint";
import {
  activateDegradedMode,
  deactivateDegradedMode,
  isDegradedModeActive,
  getDegradedStatus,
} from "@/lib/orchestration-resilience/degraded-mode";
import {
  resolveFailover,
  registerFailoverRule,
  getFailoverHistory,
  type FailoverStrategy,
} from "@/lib/orchestration-resilience/failover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_FAILOVER_STRATEGIES: FailoverStrategy[] = [
  "retry", "fallback_agent", "human_escalation", "graceful_skip",
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

  const tenantId = getTenantId(auth.profile);

  const activeCheckpoints = getActiveCheckpoints(tenantId);
  const degradedStatus = getDegradedStatus();
  const degradedActive = isDegradedModeActive();
  const failoverHistory = getFailoverHistory();

  return NextResponse.json({
    tenantId,
    checkpoints: {
      active: activeCheckpoints,
      count: activeCheckpoints.length,
    },
    degradedMode: {
      ...degradedStatus,
      active: degradedActive,
    },
    failover: {
      history: failoverHistory.slice(0, 50),
      count: failoverHistory.length,
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

  if (action === "save_checkpoint") {
    const { workflowId, stepIndex, totalSteps, state } = body as Record<string, unknown>;

    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (typeof stepIndex !== "number" || typeof totalSteps !== "number") {
      return NextResponse.json({ error: "stepIndex and totalSteps required" }, { status: 400 });
    }

    const checkpoint = saveCheckpoint(
      workflowId,
      stepIndex,
      totalSteps,
      (state && typeof state === "object") ? (state as Record<string, unknown>) : {},
      tenantId
    );
    return NextResponse.json({ action: "save_checkpoint", checkpoint, success: true }, { status: 201 });
  }

  if (action === "load_checkpoint") {
    const { workflowId } = body as Record<string, unknown>;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    const checkpoint = loadCheckpoint(workflowId);
    return NextResponse.json({ action: "load_checkpoint", checkpoint: checkpoint ?? null, found: checkpoint !== undefined, success: true });
  }

  if (action === "mark_resumed") {
    const { workflowId } = body as Record<string, unknown>;
    if (typeof workflowId !== "string") {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    markResumed(workflowId);
    return NextResponse.json({ action: "mark_resumed", workflowId, success: true });
  }

  if (action === "expire_checkpoints") {
    const removed = expireCheckpoints();
    return NextResponse.json({ action: "expire_checkpoints", removed, success: true });
  }

  if (action === "activate_degraded") {
    const { reason } = body as Record<string, unknown>;
    activateDegradedMode(typeof reason === "string" ? reason : "admin-initiated");
    return NextResponse.json({ action: "activate_degraded", success: true });
  }

  if (action === "deactivate_degraded") {
    deactivateDegradedMode();
    return NextResponse.json({ action: "deactivate_degraded", success: true });
  }

  if (action === "resolve_failover") {
    const { agentName, error, attemptCount } = body as Record<string, unknown>;
    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    const decision = resolveFailover(
      agentName,
      typeof error === "string" ? error : "",
      typeof attemptCount === "number" ? attemptCount : 1
    );
    return NextResponse.json({ action: "resolve_failover", decision, success: true });
  }

  if (action === "register_failover_rule") {
    const { agentName, strategy } = body as Record<string, unknown>;
    if (typeof agentName !== "string") {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (!VALID_FAILOVER_STRATEGIES.includes(strategy as FailoverStrategy)) {
      return NextResponse.json(
        { error: `strategy must be one of: ${VALID_FAILOVER_STRATEGIES.join(", ")}` },
        { status: 400 }
      );
    }
    registerFailoverRule(agentName, strategy as FailoverStrategy);
    return NextResponse.json({ action: "register_failover_rule", agentName, strategy, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'save_checkpoint', 'load_checkpoint', 'mark_resumed', 'expire_checkpoints', 'activate_degraded', 'deactivate_degraded', 'resolve_failover', or 'register_failover_rule'.`,
    },
    { status: 400 }
  );
}
