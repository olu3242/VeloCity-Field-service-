import { REGIONS, type RegionStatus } from "./region-registry";

export interface RegionHealthReport {
  regionId: string;
  status: RegionStatus;
  latencyScore: number;
  workerScore: number;
  queueScore: number;
  compositeScore: number;
  recommendation: string;
}

const TARGET_WORKERS = 3;
const MAX_QUEUE = 150;

function computeRecommendation(composite: number): string {
  if (composite > 80) return "Healthy";
  if (composite >= 60) return "Monitor";
  if (composite >= 40) return "Scale workers";
  return "Consider failover";
}

export function scoreRegionHealth(
  regionId: string
): RegionHealthReport | undefined {
  const region = REGIONS.get(regionId);
  if (!region) return undefined;

  const latencyScore = Math.max(0, 100 - (region.avgLatencyMs - 50) / 10);
  const workerScore = Math.min(100, (region.workerCount / TARGET_WORKERS) * 100);
  const queueScore = Math.max(0, 100 - (region.queueDepth / MAX_QUEUE) * 100);
  const compositeScore =
    latencyScore * 0.4 + workerScore * 0.3 + queueScore * 0.3;

  return {
    regionId,
    status: region.status,
    latencyScore,
    workerScore,
    queueScore,
    compositeScore,
    recommendation: computeRecommendation(compositeScore),
  };
}

export function getRegionHealthReports(): RegionHealthReport[] {
  return Array.from(REGIONS.keys())
    .map((id) => scoreRegionHealth(id))
    .filter((r): r is RegionHealthReport => r !== undefined);
}

export function detectDegradedRegions(): RegionHealthReport[] {
  return getRegionHealthReports().filter((r) => r.compositeScore < 60);
}

export function getLatencyAwareRoute(preferredRegionId?: string): string {
  if (preferredRegionId) {
    const preferred = scoreRegionHealth(preferredRegionId);
    if (preferred && preferred.compositeScore >= 70) {
      return preferredRegionId;
    }
  }

  const reports = getRegionHealthReports().filter(
    (r) => r.compositeScore >= 70
  );

  const best = reports.reduce<RegionHealthReport | undefined>(
    (lowest, report) => {
      const region = REGIONS.get(report.regionId);
      const lowestRegion = lowest ? REGIONS.get(lowest.regionId) : undefined;
      if (!region) return lowest;
      if (!lowestRegion) return report;
      return region.avgLatencyMs < lowestRegion.avgLatencyMs ? report : lowest;
    },
    undefined
  );

  return best?.regionId ?? "us-east";
}
