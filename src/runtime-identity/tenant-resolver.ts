import { TenantContext } from "./identity-types";

/** The fallback tenant used when no tenant can be resolved for a user. */
const DEFAULT_TENANT: TenantContext = {
  tenantId: "default",
  slug: "default",
  name: "Default Tenant",
};

/**
 * Resolves the TenantContext for a given user by querying their profile record.
 * Falls back to the default tenant if no tenant assignment is found.
 *
 * @param supabase - Supabase client instance
 * @param userId - The UUID of the user
 * @returns The resolved TenantContext
 */
export async function resolveTenant(
  supabase: unknown,
  userId: string
): Promise<TenantContext> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{
            data: {
              tenant_id: string;
              tenants?: {
                id: string;
                slug: string;
                name: string;
                franchise_id?: string;
              } | null;
            } | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("profiles")
    .select("tenant_id, tenants(id, slug, name, franchise_id)")
    .eq("id", userId)
    .single();

  if (error || !data || !data.tenant_id) {
    return DEFAULT_TENANT;
  }

  const tenant = data.tenants;

  if (!tenant) {
    return {
      tenantId: data.tenant_id,
      slug: data.tenant_id,
      name: data.tenant_id,
    };
  }

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    franchiseId: tenant.franchise_id,
  };
}

/**
 * Returns the default/fallback TenantContext used when no tenant can be resolved.
 *
 * @returns The default TenantContext
 */
export function getDefaultTenant(): TenantContext {
  return { ...DEFAULT_TENANT };
}

/**
 * Validates that a user's tenant ID matches the expected tenant ID for an operation.
 *
 * @param tenantId - The tenant ID of the resource being accessed
 * @param userTenantId - The tenant ID from the user's identity
 * @returns true if they match
 */
export function validateTenantAccess(tenantId: string, userTenantId: string): boolean {
  return tenantId === userTenantId;
}
