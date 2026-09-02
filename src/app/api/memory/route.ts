import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  retrieveMemories,
  findSimilarCases,
  getMemoryStats,
} from "@/lib/enterprise-memory";

type MemoryCategory =
  | "decision"
  | "outcome"
  | "incident"
  | "lesson"
  | "recommendation"
  | "forecast";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const tenantId = searchParams.get("tenantId") ?? getTenantId(profile);

  const category = searchParams.get("category") as MemoryCategory | null;
  const entityType = searchParams.get("entityType") ?? undefined;
  const entityId = searchParams.get("entityId") ?? undefined;
  const search = searchParams.get("search");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  let memories;
  if (search) {
    memories = await findSimilarCases(tenantId, search, limit);
  } else {
    memories = await retrieveMemories(tenantId, {
      category: category ?? undefined,
      entityType,
      entityId,
      limit,
    });
  }

  const stats = await getMemoryStats(tenantId);

  return NextResponse.json({
    ok: true,
    memories,
    stats,
    total: memories.length,
  });
}
