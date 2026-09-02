import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  syncDigitalTwin,
  runSimulation,
  type ScenarioParams,
} from "@/lib/digital-twin";

async function getAdminTenantId(
  request: NextRequest
): Promise<
  | { tenantId: string; error: null }
  | { tenantId: null; error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      tenantId: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      tenantId: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId") ?? getTenantId(profile);

  return { tenantId, error: null };
}

export async function GET(request: NextRequest) {
  const { tenantId, error } = await getAdminTenantId(request);
  if (error) return error;

  const state = await syncDigitalTwin(tenantId);
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: NextRequest) {
  const { tenantId, error } = await getAdminTenantId(request);
  if (error) return error;

  const body = await request.json();
  const scenario: ScenarioParams = body.scenario;

  const baseline = await syncDigitalTwin(tenantId);
  const result = await runSimulation(baseline, scenario);

  return NextResponse.json({ ok: true, result });
}
