import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { uploadJobPhoto } from "@/lib/storage/uploadJobPhoto";
import { photoUploadSchema, validationError } from "@/lib/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const role = profile?.role as "customer" | "provider" | "admin" | undefined;
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const parsed = photoUploadSchema.safeParse({ photo_type: form.get("photo_type") ?? "evidence" });
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  const photoType = parsed.data.photo_type;
  if (!(file instanceof File)) return NextResponse.json({ error: "Photo file is required." }, { status: 400 });

  let query = supabase.from("jobs").select("id,customer_id,provider_id,photo_urls").eq("tenant_id", tenantId).eq("id", id);
  if (role === "customer") query = query.eq("customer_id", user.id);
  if (role === "provider") {
    const { data: provider } = await supabase.from("providers").select("id").eq("tenant_id", tenantId).eq("user_id", user.id).single();
    query = query.eq("provider_id", provider?.id ?? "");
  }
  const { data: job } = await query.single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const result = await uploadJobPhoto({ supabase, tenantId, jobId: id, uploadedBy: user.id, uploaderRole: role, photoType, file });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const urls = Array.isArray(job.photo_urls) ? [...job.photo_urls, result.photo.url] : [result.photo.url];
  await supabase.from("jobs").update({ photo_urls: urls }).eq("tenant_id", tenantId).eq("id", id);
  return NextResponse.json(result);
}
