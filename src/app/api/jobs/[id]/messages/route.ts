import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getMessages } from "@/lib/messaging/getMessages";
import { sendMessage } from "@/lib/messaging/sendMessage";
import { messageCreateSchema, validationError } from "@/lib/validation";

async function canAccessJob(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, userId: string, role: string, jobId: string) {
  let query = supabase.from("jobs").select("id,customer_id,provider_id").eq("tenant_id", tenantId).eq("id", jobId);
  if (role === "customer") query = query.eq("customer_id", userId);
  if (role === "provider") {
    const { data: provider } = await supabase.from("providers").select("id").eq("tenant_id", tenantId).eq("user_id", userId).single();
    query = query.eq("provider_id", provider?.id ?? "");
  }
  const { data } = await query.single();
  return Boolean(data);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  if (!await canAccessJob(supabase, tenantId, user.id, profile?.role ?? "", id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ data: await getMessages(supabase, tenantId, id) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const role = profile?.role as "customer" | "provider" | "admin" | undefined;
  if (!role || !await canAccessJob(supabase, tenantId, user.id, role, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = messageCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  const { data, error } = await sendMessage({ supabase, tenantId, jobId: id, senderId: user.id, senderRole: role, message: parsed.data.message, attachments: parsed.data.attachments });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
