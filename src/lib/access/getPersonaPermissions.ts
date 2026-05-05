import type { SupabaseClient } from "@supabase/supabase-js";

export async function getPersonaPermissions(supabase: SupabaseClient, personaId: string) {
  const [{ data: objects }, { data: fields }, { data: actions }, { data: modules }] = await Promise.all([
    supabase.from("persona_object_permissions").select("*").eq("persona_id", personaId),
    supabase.from("persona_field_permissions").select("*").eq("persona_id", personaId),
    supabase.from("persona_action_permissions").select("*").eq("persona_id", personaId),
    supabase.from("module_permissions").select("*").eq("persona_id", personaId),
  ]);
  return { objects: objects ?? [], fields: fields ?? [], actions: actions ?? [], modules: modules ?? [] };
}
