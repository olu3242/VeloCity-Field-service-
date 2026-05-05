import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/workflows/job-state-machine";
import { checkGovernance } from "@/lib/automation/governance";
import { nova } from "@/lib/agents/nova";
import { transitionSchema, validationError } from "@/lib/validation";
import type { JobStatus, UserRole } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = transitionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const { to_status, reason } = parsed.data as { to_status: JobStatus; reason?: string };

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

  if (actorRole === "customer" && job.customer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (actorRole === "provider") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!provider || job.provider_id !== provider.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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

  // ── GABRIEL governance check ───────────────────────────────
  try {
    const governance = await checkGovernance({
      jobId: id,
      fromStatus: job.status as JobStatus,
      toStatus: to_status,
      actorRole,
      reason,
    });

    if (!governance.approved) {
      return NextResponse.json(
        {
          error: governance.reason ?? "Transition blocked by governance policy",
          policy_violations: governance.policy_violations,
          risk_level: governance.risk_level,
        },
        { status: 403 }
      );
    }
  } catch {
    // Governance failure is non-blocking — log and continue
  }

  // ── NOVA analyzes the transition ───────────────────────────
  const novaAnalysis = await nova.analyzeTransition(job, to_status, actorRole, { jobId: id });

  // ── Apply the transition ───────────────────────────────────
  const { data: updatedJob, error: updateError } = await supabase
    .from("jobs")
    .update({ status: to_status })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ── Log the transition ────────────────────────────────────
  await supabase.from("job_status_history").insert({
    job_id: id,
    from_status: job.status,
    to_status,
    actor_id: user.id,
    actor_role: actorRole,
    reason: reason ?? null,
    metadata: { nova_analysis: novaAnalysis ?? {} },
  });

  // ── Emit automation event (non-blocking) ──────────────────
  try {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent(
      "job_state_changed",
      {
        job_id:      id,
        from_status: job.status,
        to_status,
        actor_role:  actorRole,
        reason:      reason ?? null,
      },
      `transition:${id}:${job.status}:${to_status}`
    );

    // Special events for key transitions
    if (to_status === "accepted") {
      await emitEvent("job_accepted", { job_id: id, provider_id: job.provider_id, customer_id: job.customer_id, urgency: job.urgency }, `job_accepted:${id}`);
    }
    if (to_status === "completed_pending_confirmation") {
      await emitEvent("job_completed", { job_id: id, provider_id: job.provider_id, customer_id: job.customer_id, total_cents: 0 }, `job_completed:${id}`);
    }
    if (to_status === "customer_confirmed") {
      await emitEvent("customer_confirmed", { job_id: id, provider_id: job.provider_id, customer_id: job.customer_id, total_cents: 0 }, `customer_confirmed:${id}`);
    }
    if (to_status === "disputed") {
      await emitEvent("dispute_opened", { job_id: id, dispute_id: null, customer_id: job.customer_id, provider_id: job.provider_id, reason: reason ?? "disputed" }, `dispute_opened:${id}`);
    }
  } catch {
    // Automation failure must never block the API response
  }

  return NextResponse.json({
    data: updatedJob,
    nova_analysis: novaAnalysis,
  });
}
