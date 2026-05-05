import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { max } from "@/lib/agents/max";
import type { Provider, Job } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { job_id } = await request.json();

  const adminClient = await createAdminClient();

  const { data: job } = await adminClient
    .from("jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Get eligible providers
  const { data: providers } = await adminClient
    .from("providers")
    .select("*, profiles!providers_user_id_fkey(full_name)")
    .eq("status", "approved")
    .eq("is_online", true)
    .contains("categories", [job.category]);

  if (!providers?.length) {
    return NextResponse.json({ error: "No available providers" }, { status: 422 });
  }

  // MAX ranks providers
  const maxOutput = await max.match(
    job as Partial<Job>,
    providers as Partial<Provider>[],
    { jobId: job_id }
  );

  if (!maxOutput?.ranked_providers.length) {
    return NextResponse.json({ error: "No suitable providers found" }, { status: 422 });
  }

  // Send offers to top providers
  const topProviders = maxOutput.ranked_providers
    .filter((p) => p.recommended)
    .slice(0, 3);

  const expiresAt = new Date(
    Date.now() + maxOutput.offer_expiry_minutes * 60 * 1000
  ).toISOString();

  const offers = await Promise.all(
    topProviders.map((p) =>
      adminClient.from("provider_offers").upsert({
        job_id,
        provider_id: p.provider_id,
        match_score: p.score,
        ai_reasoning: p.reasoning,
        offered_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
    )
  );

  // Update job status to offer_sent
  await adminClient.from("jobs").update({ status: "offer_sent" }).eq("id", job_id);

  return NextResponse.json({
    data: { offers_sent: topProviders.length, max_output: maxOutput },
  });
}
