import { FeatureFlag } from "./access-types";

/** Central registry of all feature flags and their authorized roles. */
const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  ai_dispatch: {
    key: "ai_dispatch",
    enabled: true,
    roles: ["admin", "dispatcher"],
    description: "AI-assisted job dispatching and routing recommendations",
  },
  franchise_portal: {
    key: "franchise_portal",
    enabled: true,
    roles: ["admin", "franchise_owner"],
    description: "Franchise management portal with territory and revenue views",
  },
  advanced_analytics: {
    key: "advanced_analytics",
    enabled: true,
    roles: ["admin", "franchise_owner"],
    description: "Advanced analytics dashboards with drill-down capabilities",
  },
  bulk_actions: {
    key: "bulk_actions",
    enabled: true,
    roles: ["admin"],
    description: "Bulk job, user, and resource management operations",
  },
  provider_premium_tools: {
    key: "provider_premium_tools",
    enabled: true,
    roles: ["provider"],
    description: "Premium productivity tools and earnings insights for providers",
  },
  customer_loyalty: {
    key: "customer_loyalty",
    enabled: true,
    roles: ["customer"],
    description: "Loyalty points, rewards, and referral program for customers",
  },
};

/**
 * Checks whether a feature flag is enabled for a given role.
 *
 * @param flagKey - The feature flag key to look up
 * @param role - The role string to test against the flag's allowed roles
 * @returns true if the flag exists, is enabled, and the role is authorized
 */
export function isFeatureEnabled(flagKey: string, role: string): boolean {
  const flag = FEATURE_FLAGS[flagKey];

  if (!flag || !flag.enabled) {
    return false;
  }

  return flag.roles.includes(role);
}

/**
 * Returns the list of feature flag keys that are enabled for a given role.
 *
 * @param role - The role string to evaluate
 * @returns An array of enabled feature flag keys for that role
 */
export function getEnabledFeatures(role: string): string[] {
  return Object.values(FEATURE_FLAGS)
    .filter((flag) => flag.enabled && flag.roles.includes(role))
    .map((flag) => flag.key);
}
