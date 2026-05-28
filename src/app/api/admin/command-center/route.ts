import { NextResponse } from "next/server";
import { getOperationsCommandCenter } from "@/runtime/intelligence/operations-command-center";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { user, tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const data = await getOperationsCommandCenter(admin.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Command center unavailable" },
      { status: 500 }
    );
  }
}
