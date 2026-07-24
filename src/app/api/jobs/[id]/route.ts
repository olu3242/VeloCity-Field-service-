import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// ── Per-role field allowlists for PATCH /api/jobs/[id] ───────────────────
// FSM status transitions happen through dedicated endpoints, not here.
// This endpoint is for metadata-only edits on jobs the user owns.

const CUSTOMER_PATCH_SCHEMA = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(4000).optional(),
  photo_urls: z.array(z.string().url()).optional(),
  preferred_date: z.string().trim().optional().nullable(),
  preferred_time_start: z.string().trim().optional().nullable(),
  preferred_time_end: z.string().trim().optional().nullable(),
}).strict();

const PROVIDER_PATCH_SCHEMA = z.object({
  internal_notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

const ADMIN_PATCH_SCHEMA = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(4000).optional(),
  internal_notes: z.string().trim().max(2000).optional().nullable(),
  preferred_date: z.string().trim().optional().nullable(),
  preferred_time_start: z.string().trim().optional().nullable(),
  preferred_time_end: z.string().trim().optional().nullable(),
}).strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("jobs")
    .select(`
      *,
      profiles!jobs_customer_id_fkey(id, full_name, phone, avatar_url),
      providers(id, business_name, trust_score, profiles!providers_user_id_fkey(full_name, phone, avatar_url)),
      quotes(*),
      payments(*)
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "customer";

  const body = await request.json();

  // Select schema by role — only whitelisted fields reach the database.
  let schema: typeof ADMIN_PATCH_SCHEMA | typeof CUSTOMER_PATCH_SCHEMA | typeof PROVIDER_PATCH_SCHEMA;
  if (role === "admin" || role === "super_admin") {
    schema = ADMIN_PATCH_SCHEMA;
  } else if (role === "provider") {
    schema = PROVIDER_PATCH_SCHEMA;
  } else {
    schema = CUSTOMER_PATCH_SCHEMA;
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid fields", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // RLS on the auth client ensures the user can only update their own jobs
  // (customers: customer_id = user.id, providers: provider_id links).
  const { data, error } = await supabase
    .from("jobs")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
