import { getActiveRegions, getPrimaryRegion } from "./region-registry";

export interface FailoverDecision {
  targetRegionId: string;
  reason: string;
  estimatedLatencyMs: number;
  isFailover: boolean;
}

let FAILOVER_ACTIVE: boolean = false;
let FAILOVER_REGION_ID: string | null = null;

export function evaluateFailover(): FailoverDecision {
  const primary = getPrimaryRegion();

  if (primary && primary.status === "active") {
    return {
      targetRegionId: primary.id,
      reason: "Primary healthy",
      estimatedLatencyMs: primary.avgLatencyMs,
      isFailover: false,
    };
  }

  const activeRegions = getActiveRegions();
  const best = activeRegions.reduce<typeof activeRegions[number] | undefined>(
    (lowest, region) =>
      lowest === undefined || region.avgLatencyMs < lowest.avgLatencyMs
        ? region
        : lowest,
    undefined
  );

  if (best) {
    FAILOVER_ACTIVE = true;
    FAILOVER_REGION_ID = best.id;
    return {
      targetRegionId: best.id,
      reason: "Primary unavailable — failing over",
      estimatedLatencyMs: best.avgLatencyMs,
      isFailover: true,
    };
  }

  return {
    targetRegionId: "local",
    reason: "No regions available",
    estimatedLatencyMs: 0,
    isFailover: false,
  };
}

export function activateFailover(regionId: string): void {
  FAILOVER_ACTIVE = true;
  FAILOVER_REGION_ID = regionId;
}

export function deactivateFailover(): void {
  FAILOVER_ACTIVE = false;
  FAILOVER_REGION_ID = null;
}

export function isFailoverActive(): boolean {
  return FAILOVER_ACTIVE;
}

export function getActiveRegionId(): string {
  return FAILOVER_REGION_ID ?? "us-east";
}
