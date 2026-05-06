import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PERSONAS, mapRoleToPersona } from "./permissions";
import type { PersonaSummary } from "./types";

export async function getUserPersona(supabase: SupabaseClient, tenantId: string, userId: string): Promise<PersonaSummary> {
  const { data } = await supabase
    .from("persona_assignments")
    .select("personas(id,key,name,description,default_dashboard)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const persona = data?.personas as { id?: string; key?: string; name?: string; description?: string; default_dashboard?: string } | null | undefined;
  if (persona?.key && persona.key in DEFAULT_PERSONAS) {
    return {
      id: persona.id,
      key: persona.key as PersonaSummary["key"],
      name: persona.name ?? DEFAULT_PERSONAS[persona.key as PersonaSummary["key"]].name,
      description: persona.description ?? "",
      defaultDashboard: persona.default_dashboard ?? DEFAULT_PERSONAS[persona.key as PersonaSummary["key"]].defaultDashboard,
    };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).eq("tenant_id", tenantId).maybeSingle();
  const key = mapRoleToPersona((profile as { role?: string } | null)?.role);
  return DEFAULT_PERSONAS[key];
}
