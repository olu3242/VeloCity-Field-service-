import { createAdminClient } from "@/lib/supabase/server";
import { getUserPersona } from "./getUserPersona";
import type { AccessDecision, CheckFieldPermissionInput } from "./types";

export async function checkFieldPermission(input: CheckFieldPermissionInput): Promise<AccessDecision> {
  const supabase = await createAdminClient();
  const persona = await getUserPersona(supabase, input.tenantId, input.userId);
  if (persona.key === "super_admin") return { allowed: true, personaKey: persona.key, reason: "Super Admin bypass." };

  if (persona.id) {
    const { data } = await supabase
      .from("persona_field_permissions")
      .select("visible,editable,masked,hidden,read_only,required")
      .eq("persona_id", persona.id)
      .eq("object_key", input.object)
      .eq("field_key", input.field)
      .maybeSingle();
    if (data && input.operation in data) {
      return {
        allowed: Boolean((data as Record<string, unknown>)[input.operation]),
        personaKey: persona.key,
        reason: "Persona field permission applied.",
      };
    }
  }

  const financeVisible = ["tenant_admin", "finance_admin", "auditor"].includes(persona.key);
  const sensitive = ["stripe", "payout", "service_role", "internal", "evidence", "documents", "prompt", "output"].some((token) => input.field.includes(token));
  const allowed = input.operation === "visible" ? !sensitive || financeVisible : input.operation === "masked" ? sensitive && !financeVisible : false;
  return { allowed, personaKey: persona.key, reason: "Fallback field policy applied." };
}
