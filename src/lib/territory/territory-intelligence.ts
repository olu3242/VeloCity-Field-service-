// Territory Intelligence — demand signal tracking, coverage analysis, provider density.
// TESS agent consumes these signals for territory optimization.

export type DemandSignalType =
  | "high_demand_spike" | "provider_shortage" | "seasonal_pattern"
  | "new_service_type" | "competitor_entry" | "churn_cluster";

export interface TerritoryZone {
  id: string;
  tenantId: string;
  name: string;
  region: string;
  coverageRadiusKm: number;
  activeProviders: number;
  pendingJobs: number;
  avgResponseTimeMin: number;
  demandScore: number; // 0–100
  supplyScore: number; // 0–100
  healthStatus: "healthy" | "strained" | "undersupplied" | "oversupplied";
  updatedAt: string;
}

export interface DemandSignal {
  id: string;
  tenantId: string;
  zoneId: string;
  signalType: DemandSignalType;
  intensity: number; // 0–1
  detail: string;
  detectedAt: string;
  expiresAt?: string;
}

export interface ProviderDensitySnapshot {
  zoneId: string;
  tenantId: string;
  totalProviders: number;
  activeProviders: number;
  avgRating: number;
  densityPerSqKm: number;
  snapshotAt: string;
}

const ZONES = new Map<string, TerritoryZone>();
const SIGNALS: DemandSignal[] = [];
const DENSITY_HISTORY: ProviderDensitySnapshot[] = [];
const SIGNAL_CAP = 500;
const DENSITY_CAP = 200;

export function upsertZone(params: Omit<TerritoryZone, "healthStatus" | "updatedAt">): TerritoryZone {
  const healthStatus: TerritoryZone["healthStatus"] =
    params.pendingJobs > params.activeProviders * 3 ? "undersupplied"
    : params.activeProviders > params.pendingJobs * 3 ? "oversupplied"
    : params.demandScore > 75 && params.supplyScore < 40 ? "strained"
    : "healthy";
  const zone: TerritoryZone = { ...params, healthStatus, updatedAt: new Date().toISOString() };
  ZONES.set(params.id, zone);
  return zone;
}

export function recordDemandSignal(params: Omit<DemandSignal, "id" | "detectedAt">): DemandSignal {
  const signal: DemandSignal = {
    id: `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    detectedAt: new Date().toISOString(),
  };
  if (SIGNALS.length >= SIGNAL_CAP) SIGNALS.shift();
  SIGNALS.push(signal);
  return signal;
}

export function recordDensitySnapshot(params: Omit<ProviderDensitySnapshot, "snapshotAt">): ProviderDensitySnapshot {
  const snapshot: ProviderDensitySnapshot = { ...params, snapshotAt: new Date().toISOString() };
  if (DENSITY_HISTORY.length >= DENSITY_CAP) DENSITY_HISTORY.shift();
  DENSITY_HISTORY.push(snapshot);
  return snapshot;
}

export function getZonesByTenant(tenantId: string): TerritoryZone[] {
  return Array.from(ZONES.values()).filter(z => z.tenantId === tenantId);
}

export function getStrainingZones(tenantId?: string): TerritoryZone[] {
  return Array.from(ZONES.values()).filter(z => z.healthStatus === "strained" || z.healthStatus === "undersupplied")
    .filter(z => !tenantId || z.tenantId === tenantId);
}

export function getActiveSignals(tenantId?: string): DemandSignal[] {
  const now = new Date().toISOString();
  return SIGNALS.filter(s =>
    (!tenantId || s.tenantId === tenantId) &&
    (!s.expiresAt || s.expiresAt > now)
  ).slice(-50);
}

export function getSignalsByZone(zoneId: string): DemandSignal[] {
  return SIGNALS.filter(s => s.zoneId === zoneId).slice(-20);
}

export function getLatestDensity(zoneId: string): ProviderDensitySnapshot | null {
  return [...DENSITY_HISTORY].reverse().find(d => d.zoneId === zoneId) ?? null;
}

export function getTerritoryIntelligenceSummary(tenantId?: string) {
  const zones = Array.from(ZONES.values()).filter(z => !tenantId || z.tenantId === tenantId);
  const activeSignals = getActiveSignals(tenantId);
  const byHealth: Record<string, number> = {};
  for (const z of zones) byHealth[z.healthStatus] = (byHealth[z.healthStatus] ?? 0) + 1;
  const avgDemand = zones.length ? zones.reduce((s, z) => s + z.demandScore, 0) / zones.length : 0;
  return {
    zoneCount: zones.length,
    byHealth,
    avgDemandScore: Math.round(avgDemand),
    activeSignalCount: activeSignals.length,
    highIntensitySignals: activeSignals.filter(s => s.intensity > 0.7).length,
  };
}
