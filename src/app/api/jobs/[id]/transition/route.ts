import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/workflows/job-state-machine";
import { checkGovernance } from "@/lib/automation/governance";
import { nova } from "@/lib/agents/nova";
import { transitionSchema, validationError } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";
import { calculateCancellationPolicy } from "@/lib/policies/cancellationRules";
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
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const actorRole = profile?.role as UserRole;
  const tenantId = getTenantId(profile);

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
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
      .eq("tenant_id", tenantId)
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

  if (to_status === "in_progress") {
    const [{ data: checkin }, { data: beforePhoto }] = await Promise.all([
      supabase.from("job_checkins").select("id").eq("tenant_id", tenantId).eq("job_id", id).eq("status", "arrived").limit(1).maybeSingle(),
      supabase.from("job_photos").select("id").eq("tenant_id", tenantId).eq("job_id", id).eq("photo_type", "before").limit(1).maybeSingle(),
    ]);
    if (!checkin) return NextResponse.json({ error: "Valid provider arrival check-in is required before work starts." }, { status: 409 });
    if (!beforePhoto) return NextResponse.json({ error: "At least one before photo is required before work starts." }, { status: 409 });
  }

  if (to_status === "completed_pending_confirmation") {
    const { data: afterPhoto } = await supabase
      .from("job_photos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("job_id", id)
      .eq("photo_type", "after")
      .limit(1)
      .maybeSingle();
    if (!afterPhoto) return NextResponse.json({ error: "At least one after photo is required before completion." }, { status: 409 });
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
  const novaAnalysis = await nova.analyzeTransition(job, to_status, actorRole, { jobId: id, tenantId });

  // ── Apply the transition ───────────────────────────────────
  const { data: updatedJob, error: updateError } = await supabase
    .from("jobs")
    .update({
      status: to_status,
      accept_time: to_status === "accepted" ? new Date().toISOString() : job.accept_time,
      completion_time: ["completed_pending_confirmation", "completed"].includes(to_status) ? new Date().toISOString() : job.completion_time,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ── Log the transition ────────────────────────────────────
  await supabase.from("job_status_history").insert({
    job_id: id,
    tenant_id: tenantId,
    from_status: job.status,
    to_status,
    actor_id: user.id,
    actor_role: actorRole,
    reason: reason ?? null,
    metadata: { nova_analysis: novaAnalysis ?? {} },
  });

  try {
    const basePayload = {
      job_id: id,
      tenant_id: tenantId,
      customer_id: job.customer_id,
      provider_id: job.provider_id,
      from_status: job.status,
      to_status,
      actor_role: actorRole,
      title: job.title,
      category: job.category,
    };

    await emitEvent(supabase, {
      type: "job_state_changed",
      source: "api.jobs.transition",
      entityType: "job",
      entityId: id,
      actorId: user.id,
      tenantId,
      dedupKey: `job_state_changed:${id}:${to_status}:${Date.now()}`,
      payload: basePayload,
    });

    const transitionEvent =
      to_status === "accepted" ? "job_accepted" :
      to_status === "in_progress" ? "job_started" :
      to_status === "completed_pending_confirmation" ? "job_completed" :
      to_status === "customer_confirmed" ? "customer_confirmed" :
      to_status === "completed" ? "payout_queued" :
      to_status === "disputed" ? "dispute_opened" :
      null;

    if (transitionEvent) {
      await emitEvent(supabase, {
        type: transitionEvent,
        source: "api.jobs.transition",
        entityType: "job",
        entityId: id,
        actorId: user.id,
        tenantId,
        dedupKey: `${transitionEvent}:${id}:${Date.now()}`,
        payload: { ...basePayload, reason: reason ?? null },
      });
    }

    if (to_status === "cancelled") {
      const policy = calculateCancellationPolicy({ status: job.status, actorRole, quotedCostCents: job.quoted_cost_cents });
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_id: user.id,
        actor_role: actorRole,
        action: policy.event,
        entity_type: "job",
        entity_id: id,
        metadata: policy,
      });
      if (policy.feeCents > 0) {
        await emitEvent(supabase, {
          type: "cancellation_fee_applied",
          source: "api.jobs.transition",
          entityType: "job",
          entityId: id,
          actorId: user.id,
          tenantId,
          dedupKey: `cancellation_fee_applied:${id}:${Date.now()}`,
          payload: { ...basePayload, fee_cents: policy.feeCents, reason: policy.reason },
        });
      }
    }

    if (to_status === "customer_confirmed" || to_status === "completed") {
      await emitEvent(supabase, {
        type: "review_requested",
        source: "api.jobs.transition",
        entityType: "job",
        entityId: id,
        actorId: user.id,
        tenantId,
        dedupKey: `review_requested:${id}`,
        payload: basePayload,
      });
    }
  } catch {
    // Automation failure must never block the API response.
  }

  return NextResponse.json({
    data: updatedJob,
    nova_analysis: novaAnalysis,
  });
}
