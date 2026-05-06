import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { createProviderCheckIn } from "@/lib/location/checkIn";
import { checkInSchema, validationError } from "@/lib/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "provider") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = getTenantId(profile);

  const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  const { latitude, longitude, status } = parsed.data;

  const { data: provider } = await supabase.from("providers").select("id").eq("tenant_id", tenantId).eq("user_id", user.id).single();
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const { data: job } = await supabase.from("jobs").select("*").eq("tenant_id", tenantId).eq("id", id).eq("provider_id", provider.id).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const result = await createProviderCheckIn({ supabase, tenantId, job, providerId: provider.id, latitude, longitude, status });
  if (!result.ok) return NextResponse.json({ error: result.error ?? result.proximity.reason, proximity: result.proximity }, { status: 422 });
  return NextResponse.json(result);
}
