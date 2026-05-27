export interface RegionConfig {
  regionId: string
  name: string
  endpoint: string
  status: "active" | "degraded" | "offline" | "failover"
  isPrimary: boolean
  workerCount: number
  latencyMs: number
  lastHealthCheckAt: string
}

const REGIONS: Map<string, RegionConfig> = new Map()

function preRegisterRegions(): void {
  const seeds: Omit<RegionConfig, "lastHealthCheckAt">[] = [
    { regionId: "us-east-1", name: "US East 1", endpoint: "https://us-east-1.velocity.internal", status: "active", isPrimary: true, workerCount: 50, latencyMs: 12 },
    { regionId: "eu-west-1", name: "EU West 1", endpoint: "https://eu-west-1.velocity.internal", status: "active", isPrimary: false, workerCount: 30, latencyMs: 45 },
    { regionId: "ap-southeast-1", name: "AP Southeast 1", endpoint: "https://ap-southeast-1.velocity.internal", status: "active", isPrimary: false, workerCount: 20, latencyMs: 80 },
  ]
  for (const s of seeds) {
    REGIONS.set(s.regionId, { ...s, lastHealthCheckAt: new Date().toISOString() })
  }
}
preRegisterRegions()

export function registerRegion(config: Omit<RegionConfig, "lastHealthCheckAt">): RegionConfig {
  const region: RegionConfig = { ...config, lastHealthCheckAt: new Date().toISOString() }
  REGIONS.set(config.regionId, region)
  return region
}

export function updateRegionHealth(
  regionId: string,
  status: RegionConfig["status"],
  latencyMs: number,
  workerCount: number,
): void {
  const r = REGIONS.get(regionId)
  if (!r) return
  REGIONS.set(regionId, { ...r, status, latencyMs, workerCount, lastHealthCheckAt: new Date().toISOString() })
}

export function getActiveRegions(): RegionConfig[] {
  return Array.from(REGIONS.values()).filter((r) => r.status === "active")
}

export function getPrimaryRegion(): RegionConfig | undefined {
  return Array.from(REGIONS.values()).find((r) => r.isPrimary)
}

export function selectRegion(preferredRegion?: string): RegionConfig {
  if (preferredRegion) {
    const preferred = REGIONS.get(preferredRegion)
    if (preferred && preferred.status === "active") return preferred
  }
  const active = getActiveRegions()
  if (active.length === 0) {
    const fallback = Array.from(REGIONS.values())[0]
    if (fallback) return fallback
    throw new Error("No regions available")
  }
  return active.reduce((min, r) => r.latencyMs < min.latencyMs ? r : min)
}
