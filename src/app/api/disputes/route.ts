import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ivy } from "@/lib/agents/ivy";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { job_id, reason, description, evidence_urls } = await request.json();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, payments(*)")
    .eq("id", job_id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // IVY analyzes the dispute immediately
  const ivyAnalysis = await ivy.analyzeDispute(
    { reason, description, evidence_urls },
    job,
    job.payments ?? [],
    undefined,
    { jobId: job_id }
  );

  const { data: dispute, error } = await supabase
    .from("disputes")
    .insert({
      job_id,
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
  await supabase.from("jobs").update({ status: "disputed" }).eq("id", job_id);

  return NextResponse.json({ data: dispute, ivy_analysis: ivyAnalysis }, { status: 201 });
}
