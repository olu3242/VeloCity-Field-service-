// POST /api/franchise/apply — creates a territory_operators candidate row.
// Accessible to authenticated users only; does not require franchise_owner role
// (applicants may not have one yet).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : null;
  const territory_id = typeof body.territory_id === "string" ? body.territory_id : null;
  const qualifications = typeof body.qualifications === "object" && body.qualifications !== null
    ? body.qualifications
    : {};

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!territory_id) return NextResponse.json({ error: "territory_id is required" }, { status: 400 });

  // Resolve tenant_id from the territory
  const adminClient = getAdminClient();
  const { data: territory, error: territoryError } = await adminClient
    .from("franchise_territories")
    .select("id, tenant_id, name, status")
    .eq("id", territory_id)
    .maybeSingle();

  if (territoryError || !territory) {
    return NextResponse.json({ error: "Territory not found" }, { status: 404 });
  }

  // Check if user already has an application for this territory
  const { data: existing } = await adminClient
    .from("territory_operators")
    .select("id, status")
    .eq("territory_id", territory_id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an application for this territory", existing },
      { status: 409 }
    );
  }

  // Create the candidate operator row
  const { data: operator, error: insertError } = await adminClient
    .from("territory_operators")
    .insert({
      tenant_id: territory.tenant_id,
      territory_id,
      profile_id: user.id,
      name,
      email: email || null,
      status: "candidate",
      qualifications,
    })
    .select("id, name, status, territory_id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Write audit log.
  // audit_logs is tenant-scoped with a database default, so omitting tenant_id
  // does not fail — it files the entry under the default tenant instead of the
  // territory's, putting a governance record in the wrong tenant's trail. The
  // operator row above is already created against territory.tenant_id; the
  // audit entry must match it.
  await adminClient.from("audit_logs").insert({
    tenant_id: territory.tenant_id,
    action: "franchise_operator_applied",
    actor_id: user.id,
    entity_type: "territory_operator",
    entity_id: operator.id,
    metadata: { territory_id, territory_name: territory.name, name },
  });

  return NextResponse.json({
    success: true,
    operator,
    territory: { id: territory.id, name: territory.name },
  });
}
