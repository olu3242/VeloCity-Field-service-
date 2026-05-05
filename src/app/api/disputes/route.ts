import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ivy } from "@/lib/agents/ivy";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);

  const { job_id, reason, description, evidence_urls } = await request.json();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, payments(*)")
    .eq("id", job_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // IVY analyzes the dispute immediately
  const ivyAnalysis = await ivy.analyzeDispute(
    { reason, description, evidence_urls },
    job,
    job.payments ?? [],
    undefined,
    { jobId: job_id, tenantId }
  );

  const { data: dispute, error } = await supabase
    .from("disputes")
    .insert({
      job_id,
      tenant_id: tenantId,
      initiated_by: user.id,
      against: job.provider_id ?? job.customer_id,
      status: "open",
      reason,
      description: description ?? null,
      evidence_urls: evidence_urls ?? [],
      ai_recommendation: ivyAnalysis ?? {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update job status
  await supabase.from("jobs").update({ status: "disputed" }).eq("id", job_id).eq("tenant_id", tenantId);

  await emitEvent(supabase, {
    type: "dispute_opened",
    source: "api.disputes.create",
    entityType: "dispute",
    entityId: dispute.id,
    actorId: user.id,
    tenantId,
    dedupKey: `dispute_opened:${dispute.id}`,
    payload: {
      job_id,
      tenant_id: tenantId,
      dispute_id: dispute.id,
      reason,
      description,
      evidence_urls: evidence_urls ?? [],
    },
  });

  return NextResponse.json({ data: dispute, ivy_analysis: ivyAnalysis }, { status: 201 });
}
