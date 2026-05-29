export type Role = "customer" | "provider" | "admin" | "franchise_owner" | "dispatcher";

export interface Identity {
  userId: string;
  email: string;
  role: Role;
  tenantId: string;
  organizationId?: string;
  franchiseId?: string;
  displayName: string;
  avatarUrl?: string;
  permissions: string[];
}

export interface TenantContext {
  tenantId: string;
  slug: string;
  name: string;
  franchiseId?: string;
}
