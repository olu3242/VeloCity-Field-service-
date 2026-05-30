import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "super_admin") return null;
  return user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await assertAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();
  const traceId = params.id;

  const [
    { data: events },
    { data: queueItems },
    { data: runs },
    { data: agentLogs },
    { data: auditLogs },
  ] = await Promise.all([
    db.from("automation_events").select("*").eq("id", traceId).limit(1),
    db.from("automation_queue").select("*").or(`event_id.eq.${traceId},dedup_key.like.%${traceId}%`).order("created_at"),
    db.from("automation_runs").select("*").or(`event_id.eq.${traceId}`).order("completed_at"),
    db.from("agent_logs").select("*").or(`job_id.eq.${traceId}`).order("created_at").limit(20),
    db.from("audit_logs").select("*").or(`entity_id.eq.${traceId}`).order("created_at").limit(20),
  ]);

  const event = events?.[0];
  const steps: Array<{ step: string; status: string; timestamp: string; detail?: unknown }> = [];
  const failures: Array<{ step: string; error: string; timestamp: string }> = [];

  if (event) {
    steps.push({ step: "event.persisted", status: "completed", timestamp: event.created_at });
  }

  (queueItems ?? []).forEach((item: { status: string; created_at: string; processed_at?: string; error_message?: string; event_type: string; retry_count: number }) => {
    steps.push({
      step: `queue.${item.event_type}`,
      status: item.status,
      timestamp: item.processed_at ?? item.created_at,
      detail: { retry_count: item.retry_count },
    });
    if (item.status === "failed" && item.error_message) {
      failures.push({ step: `queue.${item.event_type}`, error: item.error_message, timestamp: item.processed_at ?? item.created_at });
    }
  });

  (runs ?? []).forEach((run: { event_type: string; status: string; completed_at: string; output?: unknown }) => {
    steps.push({ step: `run.${run.event_type}`, status: run.status, timestamp: run.completed_at, detail: run.output });
  });

  (agentLogs ?? []).forEach((log: { agent_name: string; action: string; created_at: string; error?: string }) => {
    steps.push({ step: `agent.${log.agent_name}.${log.action}`, status: log.error ? "failed" : "completed", timestamp: log.created_at });
    if (log.error) {
      failures.push({ step: `agent.${log.agent_name}`, error: log.error, timestamp: log.created_at });
    }
  });

  steps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return NextResponse.json({
    workflow: event?.event_type ?? "unknown",
    trace_id: traceId,
    entity_type: event?.entity_type ?? null,
    entity_id: event?.entity_id ?? null,
    tenant_id: event?.tenant_id ?? null,
    runtime_steps: steps,
    audit_trail: auditLogs ?? [],
    failures,
    status: failures.length > 0 ? "degraded" : steps.length > 0 ? "completed" : "not_found",
    queried_at: new Date().toISOString(),
  });
}
