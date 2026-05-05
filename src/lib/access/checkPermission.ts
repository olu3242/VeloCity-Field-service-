import { createAdminClient } from "@/lib/supabase/server";
import { fallbackActionAllowed, fallbackObjectAllowed } from "./permissions";
import { getUserPersona } from "./getUserPersona";
import type { AccessDecision, AppAction, CheckPermissionInput, ObjectAction } from "./types";

const OBJECT_COLUMN_BY_ACTION: Partial<Record<ObjectAction, string>> = {
  create: "can_create",
  read: "can_read",
  update: "can_update",
  delete: "can_delete",
  export: "can_export",
  import: "can_import",
  assign: "can_assign",
  approve: "can_approve",
  reject: "can_reject",
  suspend: "can_suspend",
  refund: "can_refund",
  release_payout: "can_release_payout",
  override: "can_override",
  retry: "can_retry",
  view_sensitive: "can_view_sensitive",
  manage_settings: "can_manage_settings",
};

async function logDecision(input: CheckPermissionInput, decision: AccessDecision) {
  if (decision.allowed) return;
  try {
    const supabase = await createAdminClient();
    await supabase.from("access_audit_logs").insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      persona_key: decision.personaKey ?? null,
      object_key: input.object,
      action_key: input.action,
      route: input.route ?? null,
      decision: "denied",
      reason: decision.reason,
      metadata: {},
    });
  } catch {}
}

export async function checkPermission(input: CheckPermissionInput): Promise<AccessDecision> {
  const supabase = await createAdminClient();
  const persona = await getUserPersona(supabase, input.tenantId, input.userId);
  if (persona.key === "super_admin") return { allowed: true, personaKey: persona.key, reason: "Super Admin bypass." };

  const objectAction = input.action as ObjectAction;
  const objectColumn = OBJECT_COLUMN_BY_ACTION[objectAction];
  if (objectColumn && persona.id) {
    const { data } = await supabase
      .from("persona_object_permissions")
      .select(objectColumn)
      .eq("persona_id", persona.id)
      .eq("object_key", input.object)
      .maybeSingle();
    if (data && objectColumn in data) {
      const allowed = Boolean((data as unknown as Record<string, unknown>)[objectColumn]);
      const decision = { allowed, personaKey: persona.key, reason: allowed ? "Persona object permission grants access." : "Persona object permission denies access." };
      await logDecision(input, decision);
      return decision;
    }
  }

  if (persona.id) {
    const { data } = await supabase
      .from("persona_action_permissions")
      .select("allowed")
      .eq("persona_id", persona.id)
      .eq("action_key", input.action)
      .maybeSingle();
    if (data) {
      const decision = { allowed: Boolean(data.allowed), personaKey: persona.key, reason: data.allowed ? "Persona action permission grants access." : "Persona action permission denies access." };
      await logDecision(input, decision);
      return decision;
    }
  }

  const allowed = objectColumn
    ? fallbackObjectAllowed(persona.key, input.object, objectAction)
    : fallbackActionAllowed(persona.key, input.action as AppAction);
  const decision = { allowed, personaKey: persona.key, reason: allowed ? "Fallback persona policy grants access." : "Fallback persona policy denies access." };
  await logDecision(input, decision);
  return decision;
}
