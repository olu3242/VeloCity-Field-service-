import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { alice } from "@/lib/agents/alice";
import { bookingSchema, validationError } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";
import { validateServiceArea } from "@/lib/geo/validateServiceArea";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const searchParams = request.nextUrl.searchParams;
  const tenantId = getTenantId(profile);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
  const status = searchParams.get("status");
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("jobs")
    .select("*, profiles!jobs_customer_id_fkey(full_name, avatar_url)", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (profile?.role === "customer") {
    query = query.eq("customer_id", user.id);
  } else if (profile?.role === "provider") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();
    if (provider) query = query.eq("provider_id", provider.id);
  }

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    pageSize,
    hasMore: (from + pageSize) < (count ?? 0),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  const tenantId = getTenantId(profile);

  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const body = parsed.data;
  const serviceArea = await validateServiceArea({ supabase, tenantId, zip: body.zip });
  if (!serviceArea.serviceable) {
    await emitEvent(supabase, {
      type: "serviceability_failed",
      source: "api.jobs.create",
      actorId: user.id,
      tenantId,
      dedupKey: `serviceability_failed:${user.id}:${body.zip}:${Date.now()}`,
      payload: { tenant_id: tenantId, customer_id: user.id, zip: body.zip, reason: serviceArea.reason },
    });
    return NextResponse.json({ error: serviceArea.reason }, { status: 422 });
  }

  // ALICE classifies the job
  const classification = await alice.classify(
    `${body.title}: ${body.description}`,
    body.zip,
    { userId: user.id, tenantId }
  );

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: user.id,
      tenant_id: tenantId,
      category: body.category,
      title: body.title,
      description: body.description,
      urgency: body.urgency,
      status: "submitted",
      street: body.street,
      unit: body.unit ?? null,
      city: body.city,
      state: body.state,
      zip: body.zip,
      preferred_date: body.preferred_date ?? null,
      preferred_time_start: body.preferred_time_start ?? null,
      preferred_time_end: body.preferred_time_end ?? null,
      photo_urls: body.photo_urls,
      document_urls: [],
      ai_classification: classification ?? {},
      ai_match_scores: {},
      service_type_id: body.service_type_id ?? null,
      service_package_id: body.service_package_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await emitEvent(supabase, {
      type: "service_request_created",
      source: "api.jobs.create",
      entityType: "job",
      entityId: job.id,
      actorId: user.id,
      tenantId,
      dedupKey: `service_request_created:${job.id}`,
      payload: {
        job_id: job.id,
        tenant_id: tenantId,
        customer_id: user.id,
        category: body.category,
        urgency: body.urgency,
        title: body.title,
        description: body.description,
        city: body.city,
        state: body.state,
        zip: body.zip,
      },
    });

    await emitEvent(supabase, {
      type: classification?.is_serviceable === false ? "serviceability_failed" : "serviceability_passed",
      source: "api.jobs.create",
      entityType: "job",
      entityId: job.id,
      actorId: user.id,
      tenantId,
      dedupKey: `serviceability:${job.id}`,
      payload: {
        job_id: job.id,
        tenant_id: tenantId,
        customer_id: user.id,
        category: body.category,
        urgency: body.urgency,
        title: body.title,
        description: body.description,
        city: body.city,
        state: body.state,
        zip: body.zip,
        classification,
      },
    });
  } catch {
    // Automation failure must never block booking creation.
  }

  return NextResponse.json({ data: job }, { status: 201 });
}
