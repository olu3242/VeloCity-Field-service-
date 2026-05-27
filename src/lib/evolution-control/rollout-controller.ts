/**
 * Enterprise rollout controls.
 * Percentage-based feature flag rollout with certification gating.
 */

export interface RolloutConfig {
  featureId: string;
  name: string;
  tenantRolloutPct: number;       // 0-100: % of tenants that have access
  requiresCertification: boolean;
  minCertificationLevel: "standard" | "premium" | "enterprise";
  enabled: boolean;
  activatedAt?: string;
}

export const ROLLOUTS: Map<string, RolloutConfig> = new Map<string, RolloutConfig>();

export function registerFeature(config: RolloutConfig): void {
  ROLLOUTS.set(config.featureId, { ...config });
}

export function isFeatureEnabled(
  featureId: string,
  tenantIndex: number,
  totalTenants: number
): boolean {
  const config = ROLLOUTS.get(featureId);
  if (!config || !config.enabled) return false;
  const pct = (tenantIndex / Math.max(1, totalTenants)) * 100;
  return pct <= config.tenantRolloutPct;
}

export function updateRolloutPct(featureId: string, pct: number): void {
  const config = ROLLOUTS.get(featureId);
  if (config) {
    config.tenantRolloutPct = Math.min(100, Math.max(0, pct));
  }
}

export function activateFeature(featureId: string): void {
  const config = ROLLOUTS.get(featureId);
  if (config) {
    config.enabled = true;
    config.activatedAt = new Date().toISOString();
  }
}

export function deactivateFeature(featureId: string): void {
  const config = ROLLOUTS.get(featureId);
  if (config) {
    config.enabled = false;
  }
}

export function getAllFeatures(): RolloutConfig[] {
  return Array.from(ROLLOUTS.values());
}
