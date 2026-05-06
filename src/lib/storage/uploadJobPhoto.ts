import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadJobPhoto(input: {
  supabase: SupabaseClient;
  tenantId: string;
  jobId: string;
  uploadedBy: string;
  uploaderRole: "customer" | "provider" | "admin";
  photoType: "before" | "during" | "after" | "evidence";
  file: File;
}) {
  const extension = input.file.name.split(".").pop() || "jpg";
  const path = `${input.tenantId}/${input.jobId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await input.supabase.storage.from("job-photos").upload(path, input.file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: publicUrl } = input.supabase.storage.from("job-photos").getPublicUrl(path);
  const url = publicUrl.publicUrl;
  const { data, error } = await input.supabase.from("job_photos").insert({
    tenant_id: input.tenantId,
    job_id: input.jobId,
    uploaded_by: input.uploadedBy,
    uploader_role: input.uploaderRole,
    photo_type: input.photoType,
    url,
    metadata: { storage_path: path, original_name: input.file.name },
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, photo: data };
}
