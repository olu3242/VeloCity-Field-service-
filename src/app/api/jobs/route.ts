import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { alice } from "@/lib/agents/alice";
import { bookingSchema, validationError } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
  const status = searchParams.get("status");
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("jobs")
    .select("*, profiles!jobs_customer_id_fkey(full_name, avatar_url)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (profile?.role === "customer") {
    query = query.eq("customer_id", user.id);
  } else if (profile?.role === "provider") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
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

  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const body = parsed.data;

  // ALICE classifies the job
  const classification = await alice.classify(
    `${body.title}: ${body.description}`,
    body.zip,
    { userId: user.id }
  );

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: user.id,
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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Emit automation event (non-blocking) ─────────────────
  try {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent(
      "service_request_created",
      {
        job_id:      job.id,
        customer_id: user.id,
        category:    job.category,
        urgency:     job.urgency,
        zip:         job.zip,
        title:       job.title,
        description: job.description,
      },
      `service_request_created:${job.id}`
    );
  } catch {
    // Automation failure must never block the API response
  }

  return NextResponse.json({ data: job }, { status: 201 });
}
