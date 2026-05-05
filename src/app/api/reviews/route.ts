import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rex } from "@/lib/agents/rex";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);

  const { job_id, rating, comment } = await request.json();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", job_id)
    .eq("customer_id", user.id)
    .eq("tenant_id", tenantId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found or not authorized" }, { status: 404 });

  if (!["completed", "customer_confirmed", "closed"].includes(job.status)) {
    return NextResponse.json({ error: "Job must be completed before reviewing" }, { status: 400 });
  }

  // REX analyzes review authenticity
  const rexAnalysis = await rex.analyzeReview(
    rating,
    comment ?? "",
    `${job.category} job in ${job.city}`,
    { jobId: job_id, tenantId }
  );

  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      job_id,
      tenant_id: tenantId,
      reviewer_id: user.id,
      reviewee_id: job.provider_id,
      rating,
      comment: comment ?? null,
      is_public: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await emitEvent(supabase, {
    type: "review_requested",
    source: "api.reviews.create",
    entityType: "review",
    entityId: review.id,
    actorId: user.id,
    tenantId,
    dedupKey: `review_completed:${review.id}`,
    payload: {
      job_id,
      tenant_id: tenantId,
      review_id: review.id,
      customer_id: user.id,
      provider_id: job.provider_id,
      rating,
    },
  });

  return NextResponse.json({ data: review, rex_analysis: rexAnalysis }, { status: 201 });
}
