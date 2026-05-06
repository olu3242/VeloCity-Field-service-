export const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export interface TenantScopedProfile {
  role?: string | null;
  tenant_id?: string | null;
}

export function getTenantId(profile?: TenantScopedProfile | null): string {
  return profile?.tenant_id ?? DEFAULT_TENANT_ID;
}

export function withTenant<T extends Record<string, unknown>>(tenantId: string, value: T): T & { tenant_id: string } {
  return { ...value, tenant_id: tenantId };
}
