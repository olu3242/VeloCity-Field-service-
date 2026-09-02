// GET /api/offers — list pending offers for the authenticated provider.
// Returns offers scoped to the current provider and tenant.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getTenantId(profile);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending"; // pending | accepted | rejected | all
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const cursor = searchParams.get("cursor");

  // Admins can list all offers; providers can only see their own.
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (isAdmin) {
    let query = supabase
      .from("provider_offers")
      .select(`
        id, job_id, provider_id, accepted_at, rejected_at, rejection_reason,
        offer_amount_cents, expires_at, created_at, tenant_id,
        jobs(id, title, status, urgency, street, city, state),
        providers(id, business_name, trust_score)
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      if (status === "pending") {
        query = query.is("accepted_at", null).is("rejected_at", null);
      } else if (status === "accepted") {
        query = query.not("accepted_at", "is", null);
      } else if (status === "rejected") {
        query = query.not("rejected_at", "is", null);
      }
    }

    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      data,
      meta: {
        count: data?.length ?? 0,
        cursor: data?.length === limit ? data[data.length - 1]?.created_at : null,
      },
    });
  }

  // Provider: look up their provider record.
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: "Not a provider" }, { status: 403 });
  }

  let query = supabase
    .from("provider_offers")
    .select(`
      id, job_id, accepted_at, rejected_at, rejection_reason,
      offer_amount_cents, expires_at, created_at,
      jobs(id, title, status, urgency, street, city, state, category)
    `)
    .eq("provider_id", provider.id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    if (status === "pending") {
      query = query.is("accepted_at", null).is("rejected_at", null);
    } else if (status === "accepted") {
      query = query.not("accepted_at", "is", null);
    } else if (status === "rejected") {
      query = query.not("rejected_at", "is", null);
    }
  }

  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    meta: {
      count: data?.length ?? 0,
      cursor: data?.length === limit ? data[data.length - 1]?.created_at : null,
    },
  });
}
