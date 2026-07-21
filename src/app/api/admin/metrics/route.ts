import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";

async function assertAdmin(): Promise<{ tenantId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const row = profile as { role?: string; tenant_id?: string } | null;
  if (row?.role !== "admin" || !row.tenant_id) return null;
  return { tenantId: row.tenant_id };
}

export async function GET() {
  const admin = await assertAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = admin;
  const adminClient = getAdminClient();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Run all Supabase queries concurrently
  const [
    queueAllResult,
    queueFailedLastHourResult,
    runsLastHourResult,
    jobsAllResult,
    jobsLast24hResult,
    agentLogsLast24hResult,
    auditLogsLast24hResult,
  ] = await Promise.all([
    // automation_queue: all rows for status breakdown
    adminClient
      .from("automation_queue")
      .select("status")
      .eq("tenant_id", tenantId),

    // automation_queue: failed in last 1 hour
    adminClient
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .gte("created_at", oneHourAgo),

    // automation_runs: completed in last 1 hour (for avg duration)
    adminClient
      .from("automation_runs")
      .select("started_at, completed_at")
      .eq("tenant_id", tenantId)
      .eq("status", "success")
      .gte("completed_at", oneHourAgo),

    // jobs: all rows for status breakdown
    adminClient
      .from("jobs")
      .select("status")
      .eq("tenant_id", tenantId),

    // jobs: created in last 24h
    adminClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", oneDayAgo),

    // agent_logs: count by agent_name in last 24h
    adminClient
      .from("agent_logs")
      .select("agent_name")
      .eq("tenant_id", tenantId)
      .gte("created_at", oneDayAgo),

    // audit_logs: count in last 24h
    adminClient
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", oneDayAgo),
  ]);

  // --- Queue metrics ---
  const queueRows = (queueAllResult.data ?? []) as Array<{ status: string }>;
  const queueByStatus = queueRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const queue = {
    pending: queueByStatus["pending"] ?? 0,
    processing: queueByStatus["processing"] ?? 0,
    completed: queueByStatus["completed"] ?? 0,
    failed: queueByStatus["failed"] ?? 0,
    failedLastHour: queueFailedLastHourResult.count ?? 0,
  };

  // --- Jobs metrics ---
  const jobRows = (jobsAllResult.data ?? []) as Array<{ status: string }>;
  const jobsByStatus = jobRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const jobs = {
    pending: jobsByStatus["pending"] ?? 0,
    assigned: jobsByStatus["assigned"] ?? 0,
    in_progress: jobsByStatus["in_progress"] ?? 0,
    completed: jobsByStatus["completed"] ?? 0,
    cancelled: jobsByStatus["cancelled"] ?? 0,
    createdLast24h: jobsLast24hResult.count ?? 0,
  };

  // --- Agent metrics ---
  const agentRows = (agentLogsLast24hResult.data ?? []) as Array<{
    agent_name: string;
  }>;
  const executionsByAgent = agentRows.reduce<Record<string, number>>(
    (acc, row) => {
      if (row.agent_name) {
        acc[row.agent_name] = (acc[row.agent_name] ?? 0) + 1;
      }
      return acc;
    },
    {}
  );

  const agents = {
    executionsByAgent,
    totalLast24h: agentRows.length,
  };

  // --- Audit logs ---
  const auditLogs = {
    last24h: auditLogsLast24hResult.count ?? 0,
  };

  // --- Avg run duration (last hour, completed runs) ---
  const runRows = (runsLastHourResult.data ?? []) as Array<{
    started_at: string;
    completed_at: string | null;
  }>;
  let avgDurationMs: number | null = null;
  if (runRows.length > 0) {
    const durations = runRows
      .filter((r) => r.completed_at != null)
      .map(
        (r) =>
          new Date(r.completed_at!).getTime() -
          new Date(r.started_at).getTime()
      )
      .filter((d) => d >= 0);
    if (durations.length > 0) {
      avgDurationMs = Math.round(
        durations.reduce((s, d) => s + d, 0) / durations.length
      );
    }
  }

  // --- Circuit breaker metrics ---
  const allCircuits = getAllCircuits();
  const circuits = {
    total: allCircuits.length,
    open: allCircuits.filter((c) => c.state === "open").length,
    closed: allCircuits.filter((c) => c.state === "closed").length,
    halfOpen: allCircuits.filter((c) => c.state === "half-open").length,
  };

  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    queue,
    runs: {
      completedLastHour: runRows.length,
      avgDurationMs,
    },
    jobs,
    agents,
    auditLogs,
    circuits,
  });
}
