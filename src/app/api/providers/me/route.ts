import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { providerProfileUpdateSchema, validationError } from "@/lib/validation";

// GET /api/providers/me — the authenticated provider's own business profile.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: provider, error } = await supabase
    .from("providers")
    .select(
      "id, business_name, business_license, insurance_number, insurance_expiry, categories, service_radius_miles, hourly_rate_cents, bio, years_experience, status, trust_score, completed_jobs, cancellation_rate, response_time_minutes"
    )
    .eq("user_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });

  const { data: documents } = await supabase
    .from("provider_documents")
    .select("id, document_type, status, url, expires_at, created_at")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: { provider, documents: documents ?? [] } });
}

// PATCH /api/providers/me — update the authenticated provider's own business profile.
// Providers may only edit their own row; status/trust/performance fields are not editable here.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = providerProfileUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("providers")
    .select("id, user_id")
    .eq("user_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("providers")
    .update(parsed.data)
    .eq("id", existing.id)
    .select(
      "id, business_name, business_license, insurance_number, insurance_expiry, categories, service_radius_miles, hourly_rate_cents, bio, years_experience"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
