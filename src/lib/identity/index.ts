import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantIdOrDefault } from "@/lib/tenancy";
import type { UserRole } from "@/types";

export interface ResolvedUser {
  id: string;
  email: string | undefined;
  role: UserRole;
  tenantId: string;
  organizationId: string | null;
  franchiseId: string | null;
  fullName: string | null;
}

export interface ResolvedIdentity {
  user: ResolvedUser | null;
  authenticated: boolean;
  error?: string;
}

/** Resolve full user identity in a single Supabase round-trip */
export async function resolveIdentity(supabase: SupabaseClient): Promise<ResolvedIdentity> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, authenticated: false, error: authError?.message };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id, organization_id, franchise_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user: {
      id: user.id,
      email: user.email,
      role: (profile?.role as UserRole) ?? "customer",
      tenantId: getTenantIdOrDefault(profile?.tenant_id, "resolveIdentity/resolveUser"),
      organizationId: profile?.organization_id ?? null,
      franchiseId: profile?.franchise_id ?? null,
      fullName: profile?.full_name ?? null,
    },
    authenticated: true,
  };
}

/** Resolve user identity (lightweight — role + tenant only) */
export async function resolveUser(supabase: SupabaseClient): Promise<{ id: string; role: UserRole; tenantId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    role: (profile?.role as UserRole) ?? "customer",
    tenantId: getTenantIdOrDefault(profile?.tenant_id, "resolveIdentity/resolveUser"),
  };
}

export async function resolveRole(supabase: SupabaseClient, userId: string): Promise<UserRole> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.role as UserRole) ?? "customer";
}

export async function resolveTenant(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return getTenantIdOrDefault(profile?.tenant_id, "resolveIdentity/resolveUser");
}

/** Portal routing map — canonical source of truth */
export const ROLE_PORTAL_MAP: Record<UserRole, string> = {
  customer: "/dashboard",
  provider: "/provider/dashboard",
  dispatcher: "/dispatch/dashboard",
  franchise_owner: "/franchise/dashboard",
  admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

export function getPortalForRole(role: UserRole): string {
  return ROLE_PORTAL_MAP[role] ?? "/dashboard";
}
