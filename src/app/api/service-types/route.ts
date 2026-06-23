import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { serviceCategorySchema } from "@/lib/validation";

// GET /api/service-types?category=plumbing — service types and their
// packages for a category, used by the booking flow to optionally let a
// customer narrow a category into a specific service type/package. Returns
// an empty list for categories that have no configured service types yet,
// which the booking UI treats as "skip this step" so existing category-only
// bookings keep working unchanged.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);

  const categoryParam = request.nextUrl.searchParams.get("category");
  const parsedCategory = serviceCategorySchema.safeParse(categoryParam);
  if (!parsedCategory.success) {
    return NextResponse.json({ error: "Invalid or missing category" }, { status: 400 });
  }

  const { data: serviceTypes, error } = await supabase
    .from("service_types")
    .select("id, name, slug, description, default_duration_minutes, service_packages(id, tier, name, description, price_cents)")
    .eq("tenant_id", tenantId)
    .eq("category", parsedCategory.data)
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: serviceTypes ?? [] });
}
