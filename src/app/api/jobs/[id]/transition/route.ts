import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/workflows/job-state-machine";
import { nova } from "@/lib/agents/nova";
import type { JobStatus, UserRole } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to_status, reason } = await request.json() as {
    to_status: JobStatus;
    reason?: string;
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const actorRole = profile?.role as UserRole;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { allowed, requiresReason } = canTransition(
    job.status as JobStatus,
    to_status,
    actorRole
  );

  if (!allowed) {
    return NextResponse.json(
      { error: `Transition from ${job.status} to ${to_status} not allowed for role ${actorRole}` },
      { status: 403 }
    );
  }

  if (requiresReason && !reason) {
    return NextResponse.json({ error: "Reason required for this transition" }, { status: 400 });
  }

  // NOVA analyzes the transition for notifications/automations
  const novaAnalysis = await nova.analyzeTransition(job, to_status, actorRole, { jobId: id });

  // Apply the transition
  const { data: updatedJob, error: updateError } = await supabase
    .from("jobs")
    .update({ status: to_status })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log the transition with actor info
  await supabase.from("job_status_history").insert({
    job_id: id,
    from_status: job.status,
    to_status,
    actor_id: user.id,
    actor_role: actorRole,
    reason: reason ?? null,
    metadata: { nova_analysis: novaAnalysis ?? {} },
  });

  return NextResponse.json({
    data: updatedJob,
    nova_analysis: novaAnalysis,
  });
}
