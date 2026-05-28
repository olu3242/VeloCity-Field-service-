import { NextRequest } from "next/server";
import { fail, forbidden, ok, serverError, unauthorized } from "@/lib/api/response";
import { assertJobAccess } from "@/lib/services/jobs";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getMessages, sendMessage } from "@/lib/repositories/messages";
import { messageCreateSchema, validationError } from "@/lib/validation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  if (!await assertJobAccess(supabase, { tenantId, userId: user.id, role: profile?.role, jobId: id })) return forbidden();
  return ok(await getMessages(supabase, tenantId, id));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const role = profile?.role as "customer" | "provider" | "admin" | undefined;
  if (!role || !await assertJobAccess(supabase, { tenantId, userId: user.id, role, jobId: id })) return forbidden();
  const parsed = messageCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(validationError(parsed.error).error);
  const { data, error } = await sendMessage({ supabase, tenantId, jobId: id, senderId: user.id, senderRole: role, message: parsed.data.message, attachments: parsed.data.attachments });
  if (error) return serverError(error.message);
  return ok(data, { status: 201 });
}
