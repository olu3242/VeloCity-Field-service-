export type DataCategory =
  | "audit_logs"
  | "automation_events"
  | "agent_traces"
  | "telemetry_snapshots"
  | "webhook_payloads"
  | "operational_memory"
  | "user_pii";

export interface RetentionPolicy {
  category: DataCategory;
  retentionDays: number;
  archiveDays?: number;
  requiresEncryption: boolean;
  complianceTags: string[];
  tenantOverridable: boolean;
}

export const POLICIES: Map<DataCategory, RetentionPolicy> = new Map<
  DataCategory,
  RetentionPolicy
>();

const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    category: "audit_logs",
    retentionDays: 365,
    archiveDays: 730,
    requiresEncryption: true,
    complianceTags: ["SOC2", "GDPR"],
    tenantOverridable: false,
  },
  {
    category: "automation_events",
    retentionDays: 90,
    archiveDays: 365,
    requiresEncryption: false,
    complianceTags: ["SOC2"],
    tenantOverridable: true,
  },
  {
    category: "agent_traces",
    retentionDays: 30,
    archiveDays: 90,
    requiresEncryption: false,
    complianceTags: [],
    tenantOverridable: true,
  },
  {
    category: "telemetry_snapshots",
    retentionDays: 90,
    archiveDays: 365,
    requiresEncryption: false,
    complianceTags: ["SOC2"],
    tenantOverridable: true,
  },
  {
    category: "webhook_payloads",
    retentionDays: 30,
    archiveDays: 90,
    requiresEncryption: true,
    complianceTags: ["GDPR", "CCPA"],
    tenantOverridable: true,
  },
  {
    category: "operational_memory",
    retentionDays: 180,
    archiveDays: undefined,
    requiresEncryption: false,
    complianceTags: ["SOC2"],
    tenantOverridable: true,
  },
  {
    category: "user_pii",
    retentionDays: 365,
    archiveDays: 730,
    requiresEncryption: true,
    complianceTags: ["GDPR", "CCPA", "SOC2"],
    tenantOverridable: false,
  },
];

for (const policy of DEFAULT_POLICIES) {
  POLICIES.set(policy.category, policy);
}

export function getPolicy(category: DataCategory): RetentionPolicy {
  return POLICIES.get(category) as RetentionPolicy;
}

export function getAllPolicies(): RetentionPolicy[] {
  return Array.from(POLICIES.values());
}

export function getPoliciesByTag(tag: string): RetentionPolicy[] {
  return Array.from(POLICIES.values()).filter((p) =>
    p.complianceTags.includes(tag)
  );
}

export function getEncryptedCategories(): DataCategory[] {
  return Array.from(POLICIES.values())
    .filter((p) => p.requiresEncryption)
    .map((p) => p.category);
}

export function isWithinRetention(
  category: DataCategory,
  ageInDays: number
): boolean {
  const policy = getPolicy(category);
  return ageInDays <= policy.retentionDays;
}
