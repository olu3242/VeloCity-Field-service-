import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { syncJobOutcome } from "@/lib/outcomes";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = getTenantId(profile);

  let jobQuery = supabase
    .from("jobs")
    .select("id,customer_id,provider_id")
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (profile.role === "customer") jobQuery = jobQuery.eq("customer_id", user.id);
  if (profile.role === "provider") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .single();
    jobQuery = jobQuery.eq("provider_id", provider?.id ?? "");
  }

  const { data: job } = await jobQuery.single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  try {
    const outcome = await syncJobOutcome({ supabase, jobId: id, tenantId });
    return NextResponse.json({ data: outcome });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to evaluate outcome" },
      { status: 500 }
    );
  }
}

