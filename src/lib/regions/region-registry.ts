export type RegionStatus = "active" | "degraded" | "offline" | "failover";

export interface Region {
  id: string;
  name: string;
  location: string;
  status: RegionStatus;
  isPrimary: boolean;
  workerCount: number;
  queueDepth: number;
  avgLatencyMs: number;
  lastHeartbeatAt: string;
}

export const REGIONS: Map<string, Region> = new Map<string, Region>();

REGIONS.set("us-east", {
  id: "us-east",
  name: "US East",
  location: "us-east-1",
  status: "active",
  isPrimary: true,
  workerCount: 3,
  queueDepth: 0,
  avgLatencyMs: 45,
  lastHeartbeatAt: new Date().toISOString(),
});

REGIONS.set("eu-west", {
  id: "eu-west",
  name: "EU West",
  location: "eu-west-1",
  status: "active",
  isPrimary: false,
  workerCount: 2,
  queueDepth: 0,
  avgLatencyMs: 120,
  lastHeartbeatAt: new Date().toISOString(),
});

export function registerRegion(region: Region): void {
  REGIONS.set(region.id, region);
}

export function updateRegionHealth(
  regionId: string,
  updates: Partial<
    Pick<
      Region,
      "status" | "workerCount" | "queueDepth" | "avgLatencyMs" | "lastHeartbeatAt"
    >
  >
): void {
  const existing = REGIONS.get(regionId);
  if (!existing) return;
  REGIONS.set(regionId, { ...existing, ...updates });
}

export function getActiveRegions(): Region[] {
  return Array.from(REGIONS.values()).filter((r) => r.status !== "offline");
}

export function getPrimaryRegion(): Region | undefined {
  return Array.from(REGIONS.values()).find(
    (r) => r.isPrimary && r.status === "active"
  );
}

export function getRegionStatus(): {
  total: number;
  active: number;
  degraded: number;
  offline: number;
} {
  const regions = Array.from(REGIONS.values());
  return {
    total: regions.length,
    active: regions.filter((r) => r.status === "active").length,
    degraded: regions.filter((r) => r.status === "degraded").length,
    offline: regions.filter((r) => r.status === "offline").length,
  };
}
