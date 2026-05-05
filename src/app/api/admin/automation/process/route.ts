import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { processAutomationQueue } from "@/lib/automation/worker";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "automation_queue", action: "retry_automation", route: "/api/admin/automation/process" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
  const adminClient = await createAdminClient();
  const result = await processAutomationQueue(adminClient, limit, tenantId);

  return NextResponse.json(result);
}
