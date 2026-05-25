/**
 * Tenant Isolation Enforcement — ensures automation events only touch resources
 * belonging to the same tenant. Cross-tenant access is blocked by default.
 *
 * NOTE: ISOLATION_BYPASS_TENANTS is empty by default. Only add system/admin
 * tenant IDs here with explicit sign-off.
 */

export interface TenantIsolationResult {
  allowed: boolean;
  reason?: string;
}

export interface TenantContext {
  tenantId: string;
  isDefault: boolean;
  isolationLevel: "strict" | "standard";
}

/** Tenant IDs allowed to access resources across tenants (admin/system only). */
export const ISOLATION_BYPASS_TENANTS: string[] = [];

const ALLOWED: TenantIsolationResult = { allowed: true };

/**
 * Assert that the resource's tenant matches the requesting tenant.
 * Null resourceTenantId (unowned resource) is treated as allowed.
 */
export function assertTenantIsolation(
  resourceTenantId: string | null,
  requestTenantId: string
): TenantIsolationResult {
  if (resourceTenantId === null) {
    return ALLOWED;
  }

  if (resourceTenantId === requestTenantId) {
    return ALLOWED;
  }

  if (ISOLATION_BYPASS_TENANTS.includes(requestTenantId)) {
    return ALLOWED;
  }

  return {
    allowed: false,
    reason: `Tenant isolation violation: tenant "${requestTenantId}" attempted to access resource owned by "${resourceTenantId}"`,
  };
}

const DEFAULT_TENANT_ID = "default";

/**
 * Returns context metadata for a given tenant, including isolation level.
 * Tenants in ISOLATION_BYPASS_TENANTS get "standard" (can cross-read);
 * all others get "strict".
 */
export function getTenantContext(tenantId: string): TenantContext {
  const isDefault = tenantId === DEFAULT_TENANT_ID;
  const isolationLevel: "strict" | "standard" = ISOLATION_BYPASS_TENANTS.includes(tenantId)
    ? "standard"
    : "strict";

  return { tenantId, isDefault, isolationLevel };
}
