import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  generateGlobalInfrastructureOsCycle,
  getGlobalInfrastructureOsSummary,
} from "@/runtime/infrastructure/global-os";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const data = await getGlobalInfrastructureOsSummary(admin.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Global infrastructure OS summary failed" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const data = await generateGlobalInfrastructureOsCycle(admin.tenantId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Global infrastructure OS cycle failed" },
      { status: 500 }
    );
  }
}
