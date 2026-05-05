import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { gabriel } from "@/lib/agents/gabriel";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "providers", action: "approve_provider", route: "/api/admin/providers/[id]/approve" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = await createAdminClient();

  const { data: provider } = await adminClient
    .from("providers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  // GABRIEL final compliance check
  const gabrielCheck = await gabriel.screenProvider({
    business_name: provider.business_name,
    categories: provider.categories,
    documents: provider.documents as [],
    years_experience: provider.years_experience,
    completed_jobs: provider.completed_jobs,
  }, { userId: provider.user_id });

  const { data: updated, error } = await adminClient
    .from("providers")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      admin_notes: gabrielCheck?.notes ?? null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: updated, gabriel_check: gabrielCheck });
}
