import type { SupabaseClient } from "@supabase/supabase-js";

export async function validateServiceArea(input: { supabase: SupabaseClient; tenantId: string; zip: string; adminOverride?: boolean }) {
  if (input.adminOverride) return { serviceable: true, reason: "Admin override allowed service area." };
  const { data } = await input.supabase
    .from("service_areas")
    .select("id,name,zip_codes")
    .eq("tenant_id", input.tenantId)
    .eq("is_active", true);
  const match = (data ?? []).find((area) => Array.isArray(area.zip_codes) && area.zip_codes.includes(input.zip));
  return {
    serviceable: Boolean(match),
    serviceArea: match ?? null,
    reason: match ? `ZIP ${input.zip} is serviceable in ${match.name}.` : `ZIP ${input.zip} is outside active service areas.`,
  };
}
