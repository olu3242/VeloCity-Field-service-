// GET /api/admin/runtime/workstreams
// Returns the full workstream health matrix: all 14 workstreams, every platform
// dependency, queue depth, worker failures, and runtime mode.
// Intended for the admin dashboard, monitoring agents, and the deployment gate.
// Admin-only; tenant-scoped via profile.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(profile);

  try {
    const report = await aggregatePlatformHealth(tenantId);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Health aggregation failed" },
      { status: 500 },
    );
  }
}
