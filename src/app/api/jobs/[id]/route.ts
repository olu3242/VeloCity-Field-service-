import { NextRequest } from "next/server";
import { forbidden, notFound, ok, serverError, unauthorized } from "@/lib/api/response";
import { getAccessibleJob, getJobWithRuntime } from "@/lib/repositories/jobs";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const { data: accessible } = await getAccessibleJob(supabase, { tenantId, jobId: id, userId: user.id, role: profile?.role });
  if (!accessible && profile?.role !== "admin") return forbidden();

  const { data, error } = await getJobWithRuntime(supabase, id);

  if (error) return notFound(error.message);

  return ok(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const { data: accessible } = await getAccessibleJob(supabase, { tenantId, jobId: id, userId: user.id, role: profile?.role });
  if (!accessible && profile?.role !== "admin") return forbidden();

  const body = await request.json();

  const { data, error } = await supabase
    .from("jobs")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return serverError(error.message);

  return ok(data);
}
