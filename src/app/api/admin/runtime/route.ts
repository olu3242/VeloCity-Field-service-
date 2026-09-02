// Admin Runtime Control API
// GET  /api/admin/runtime  — health snapshot + operator state + circuit breakers
// POST /api/admin/runtime  — operator actions: pause, resume, disable_agent, enable_agent,
//                            disable_event, enable_event, reset_circuit, replay_event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

// Lazy-import governance (in-memory singletons, safe on cold-start)
async function getGovernance() {
  const [operator, circuitBreaker, safety] = await Promise.all([
    import("@/lib/governance/operator"),
    import("@/lib/governance/circuit-breaker"),
    import("@/lib/governance/safety"),
  ]);
  return { operator, circuitBreaker, safety };
}

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const row = profile as { role?: string; tenant_id?: string } | null;
  if (row?.role !== "admin" || !row.tenant_id) return null;
  return { user, tenantId: row.tenant_id };
}

export async function GET() {
  const admin = await assertAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { operator, circuitBreaker } = await getGovernance();
  const adminClient = getAdminClient();
  const tenantId = admin.tenantId;

  // Queue health snapshot
  const [
    { data: queueStats },
    { data: recentRuns },
    { data: recentErrors },
  ] = await Promise.all([
    adminClient.from("automation_queue")
      .select("status")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString()),
    adminClient.from("automation_runs")
      .select("status, completed_at, event_type")
      .eq("tenant_id", tenantId)
      .order("completed_at", { ascending: false })
      .limit(5),
    adminClient.from("automation_queue")
      .select("event_type, error_message, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const counts = (queueStats ?? []).reduce(
    (acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return NextResponse.json({
    operator_state: operator.getOperatorState(),
    circuits: circuitBreaker.getAllCircuits(),
    queue: {
      pending: counts["pending"] ?? 0,
      processing: counts["processing"] ?? 0,
      completed: counts["completed"] ?? 0,
      failed: counts["failed"] ?? 0,
    },
    recent_runs: recentRuns ?? [],
    recent_errors: recentErrors ?? [],
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user, tenantId } = admin;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const { operator, circuitBreaker } = await getGovernance();
  const adminClient = getAdminClient();

  switch (action) {
    case "pause_runtime":
      operator.pauseRuntime(user.id, typeof body.reason === "string" ? body.reason : "Admin initiated");
      break;

    case "resume_runtime":
      operator.resumeRuntime(user.id);
      break;

    case "disable_agent": {
      const name = typeof body.agent_name === "string" ? body.agent_name : null;
      if (!name) return NextResponse.json({ error: "agent_name required" }, { status: 400 });
      operator.disableAgent(name);
      break;
    }

    case "enable_agent": {
      const name = typeof body.agent_name === "string" ? body.agent_name : null;
      if (!name) return NextResponse.json({ error: "agent_name required" }, { status: 400 });
      operator.enableAgent(name);
      break;
    }

    case "disable_event_type": {
      const et = typeof body.event_type === "string" ? body.event_type : null;
      if (!et) return NextResponse.json({ error: "event_type required" }, { status: 400 });
      operator.disableEventType(et);
      break;
    }

    case "enable_event_type": {
      const et = typeof body.event_type === "string" ? body.event_type : null;
      if (!et) return NextResponse.json({ error: "event_type required" }, { status: 400 });
      operator.enableEventType(et);
      break;
    }

    case "reset_circuit": {
      const key = typeof body.circuit_key === "string" ? body.circuit_key : null;
      if (!key) return NextResponse.json({ error: "circuit_key required" }, { status: 400 });
      circuitBreaker.resetCircuit(key);
      break;
    }

    case "replay_event": {
      const eventId = typeof body.event_id === "string" ? body.event_id : null;
      if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

      const { data: event } = await adminClient
        .from("automation_events")
        .select("*")
        .eq("id", eventId)
        .eq("tenant_id", tenantId)
        .single();

      if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

      const ev = event as { event_type: string; payload?: unknown; tenant_id?: string };
      await adminClient.from("automation_queue").insert({
        event_id: eventId,
        event_type: ev.event_type,
        payload: ev.payload ?? {},
        tenant_id: ev.tenant_id ?? tenantId,
        status: "pending",
        retry_count: 0,
        available_at: new Date().toISOString(),
      });
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Audit log the operator action
  await adminClient.from("audit_logs").insert({
    tenant_id: tenantId,
    action: `operator:${action}`,
    actor_id: user.id,
    entity_type: "runtime",
    entity_id: null,
    metadata: { action, params: body },
  }).then(() => null);

  return NextResponse.json({ success: true, action, timestamp: new Date().toISOString() });
}
