// Tenant resolution — strict by default.
// User-facing code must ALWAYS have a valid tenant_id.
// Cron jobs and webhook handlers that cannot guarantee a tenant
// must use getTenantIdOrDefault() and log the fallback explicitly.

export const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export interface TenantScopedProfile {
  role?: string | null;
  tenant_id?: string | null;
}

/**
 * Strict tenant resolution for user-facing requests.
 * Throws a structured error if the profile has no tenant_id.
 * Use this everywhere a real authenticated user is present.
 */
export function getTenantId(profile?: TenantScopedProfile | null): string {
  const tenantId = profile?.tenant_id;
  if (!tenantId) {
    const err = new Error("TENANT_RESOLUTION_FAILED: profile.tenant_id is null or undefined. This indicates a data integrity issue — the authenticated user has no tenant assignment.");
    (err as Error & { code: string; statusCode: number }).code = "TENANT_RESOLUTION_FAILED";
    (err as Error & { code: string; statusCode: number }).statusCode = 500;
    throw err;
  }
  return tenantId;
}

/**
 * Safe fallback for contexts where tenant cannot be asserted:
 * - Cron jobs running across the default tenant
 * - Stripe webhook events lacking metadata.tenant_id
 * - Internal automation queue processing
 *
 * ALWAYS logs a warning so silent fallbacks are visible in production logs.
 */
export function getTenantIdOrDefault(
  tenantIdOrNull: string | null | undefined,
  context: string
): string {
  if (tenantIdOrNull) return tenantIdOrNull;
  // eslint-disable-next-line no-console
  console.warn(`[TENANT_FALLBACK] context="${context}" — no tenant_id found, falling back to DEFAULT_TENANT_ID. Verify this is expected.`);
  return DEFAULT_TENANT_ID;
}

export function withTenant<T extends Record<string, unknown>>(tenantId: string, value: T): T & { tenant_id: string } {
  return { ...value, tenant_id: tenantId };
}
