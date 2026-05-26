import { type DataCategory, getPolicy } from "./retention-policy";

export interface TenantDataBoundary {
  tenantId: string;
  allowedDataCategories: DataCategory[];
  restrictedOperations: string[];
  dataResidencyRegion?: string;
  encryptionRequired: boolean;
  customRetentionDays?: number;
  complianceLevel: "standard" | "enhanced" | "strict";
}

const ALL_CATEGORIES: DataCategory[] = [
  "audit_logs",
  "automation_events",
  "agent_traces",
  "telemetry_snapshots",
  "webhook_payloads",
  "operational_memory",
  "user_pii",
];

export const BOUNDARIES: Map<string, TenantDataBoundary> = new Map<
  string,
  TenantDataBoundary
>();

export function registerBoundary(boundary: TenantDataBoundary): void {
  BOUNDARIES.set(boundary.tenantId, boundary);
}

export function getBoundary(tenantId: string): TenantDataBoundary {
  return (
    BOUNDARIES.get(tenantId) ?? {
      tenantId,
      allowedDataCategories: ALL_CATEGORIES,
      restrictedOperations: [],
      encryptionRequired: false,
      complianceLevel: "standard",
    }
  );
}

export function isOperationAllowed(
  tenantId: string,
  operation: string
): boolean {
  const boundary = getBoundary(tenantId);
  return !boundary.restrictedOperations.includes(operation);
}

export function getEffectiveRetentionDays(
  tenantId: string,
  category: DataCategory
): number {
  const boundary = getBoundary(tenantId);
  const policy = getPolicy(category);

  if (
    boundary.customRetentionDays !== undefined &&
    policy.tenantOverridable
  ) {
    return Math.min(policy.retentionDays, boundary.customRetentionDays);
  }

  return policy.retentionDays;
}

export function getStrictComplianceTenants(): TenantDataBoundary[] {
  return Array.from(BOUNDARIES.values()).filter(
    (b) => b.complianceLevel === "strict"
  );
}
