import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gabriel } from "@/lib/agents/gabriel";
import { getTenantId } from "@/lib/tenancy";
import { observe } from "@/lib/idxf-integration/shadow-validator";
import type { ProviderApplicationData } from "@/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;

  const category = searchParams.get("category");
  const zip = searchParams.get("zip");

  let query = supabase
    .from("providers")
    .select("*, profiles!providers_user_id_fkey(full_name, avatar_url)")
    .eq("status", "approved")
    .eq("is_online", true)
    .order("trust_score", { ascending: false });

  if (category) {
    query = query.contains("categories", [category]);
  }

  const { data, error } = await query.limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // providers.tenant_id is NOT NULL with a database default of
  // app.default_tenant_id(). Omitting it does not fail — it silently files the
  // applicant under the default tenant, leaving them invisible to their own
  // tenant's queries, which filter providers by tenant_id. Resolve it here so
  // the row is created against the applicant's actual tenant.
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  const tenantId = getTenantId(profile);

  const body: ProviderApplicationData = await request.json();

  // GABRIEL screens the application
  const gabrielScreen = await gabriel.screenProvider({
    business_name: body.business_name,
    categories: body.categories,
    documents: [],
    years_experience: body.years_experience,
    completed_jobs: 0,
  }, { userId: user.id });

  const providerInsert = {
    user_id: user.id,
    tenant_id: tenantId,
    business_name: body.business_name,
    business_license: body.business_license ?? null,
    insurance_number: body.insurance_number ?? null,
    insurance_expiry: body.insurance_expiry ?? null,
    categories: body.categories,
    service_area_ids: [],
    service_radius_miles: body.service_radius_miles,
    hourly_rate_cents: body.hourly_rate_cents ?? null,
    bio: body.bio ?? null,
    years_experience: body.years_experience,
    status: "pending",
    trust_score: 0,
    completed_jobs: 0,
    cancellation_rate: 0,
    documents: [],
  };

  // IDXF shadow validation — observation only, never blocking.
  observe("provider", providerInsert, {
    tenantId,
    legacyAccepted: true,
    source: "api.providers.create",
  });

  const { data: provider, error } = await supabase
    .from("providers")
    .insert(providerInsert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update profile role
  await supabase.from("profiles").update({ role: "provider" }).eq("id", user.id);

  return NextResponse.json({ data: provider, gabriel_screen: gabrielScreen }, { status: 201 });
}
