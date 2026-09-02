// GET  /api/admin/orchestration-analytics — workflow efficiency, retry stats, escalation paths, bottlenecks
// POST /api/admin/orchestration-analytics — record_workflow_run | record_retry | record_escalation_path
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  recordWorkflowRun,
  getEfficiencyStats,
  getBottlenecks,
} from "@/lib/orchestration-analytics/workflow-efficiency";
import {
  recordRetry,
  getRetryStats,
  getStormingWorkflows,
} from "@/lib/orchestration-analytics/retry-analytics";
import {
  recordEscalationPath,
  getPathStats,
  getLongRunningPaths,
} from "@/lib/orchestration-analytics/escalation-path-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const workflowType = url.searchParams.get("workflowType") ?? undefined;
  const eventType = url.searchParams.get("eventType") ?? undefined;
  const bottleneckThreshold = parseInt(url.searchParams.get("bottleneckThreshold") ?? "30000", 10);
  const retryStormThreshold = parseInt(url.searchParams.get("retryStormThreshold") ?? "5", 10);
  const longRunThreshold = parseInt(url.searchParams.get("longRunThreshold") ?? "300000", 10);

  const bottlenecks = getBottlenecks(bottleneckThreshold);
  const stormingWorkflows = getStormingWorkflows(retryStormThreshold);
  const longRunningPaths = getLongRunningPaths(longRunThreshold);
  const retryStats = getRetryStats(workflowType);
  const pathStats = getPathStats(eventType);

  return NextResponse.json({
    efficiency: {
      bottlenecks,
      ...(workflowType ? { stats: getEfficiencyStats(workflowType) } : {}),
    },
    retries: {
      stats: retryStats,
      stormingWorkflows,
    },
    escalations: {
      longRunningPaths,
      pathStats,
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

  if (action === "record_workflow_run") {
    const { workflowType, durationMs, stepCount, retryCount, succeeded } =
      body as Record<string, unknown>;

    if (typeof workflowType !== "string") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    if (typeof durationMs !== "number" || typeof stepCount !== "number") {
      return NextResponse.json({ error: "durationMs and stepCount required" }, { status: 400 });
    }

    const record = recordWorkflowRun(
      workflowType,
      tenantId,
      durationMs,
      stepCount,
      typeof retryCount === "number" ? retryCount : 0,
      succeeded !== false
    );
    return NextResponse.json({ action: "record_workflow_run", record, success: true }, { status: 201 });
  }

  if (action === "record_retry") {
    const { workflowType, attemptNumber, reason, succeeded, delayMs } =
      body as Record<string, unknown>;

    if (typeof workflowType !== "string") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }

    const record = recordRetry(
      workflowType,
      tenantId,
      typeof attemptNumber === "number" ? attemptNumber : 1,
      typeof reason === "string" ? reason : "",
      succeeded === true,
      typeof delayMs === "number" ? delayMs : 0
    );
    return NextResponse.json({ action: "record_retry", record, success: true }, { status: 201 });
  }

  if (action === "record_escalation_path") {
    const { eventType, path, totalMs, resolved } = body as Record<string, unknown>;

    if (typeof eventType !== "string") {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    if (!Array.isArray(path)) {
      return NextResponse.json({ error: "path array required" }, { status: 400 });
    }

    const record = recordEscalationPath(
      tenantId,
      eventType,
      path as string[],
      typeof totalMs === "number" ? totalMs : 0,
      resolved === true
    );
    return NextResponse.json({ action: "record_escalation_path", record, success: true }, { status: 201 });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_workflow_run', 'record_retry', or 'record_escalation_path'.` },
    { status: 400 }
  );
}
