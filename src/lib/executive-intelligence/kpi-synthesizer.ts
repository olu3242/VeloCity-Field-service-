/**
 * KPI intelligence synthesis.
 * Records, tracks trends, and surfaces off-track KPIs.
 */

export interface KPISnapshot {
  kpiName: string;
  value: number;
  unit: string;
  target?: number;
  status: "on_track" | "at_risk" | "off_track";
  trend: "up" | "down" | "flat";
  capturedAt: string;
}

const KPI_HISTORY_CAP = 30;
export const KPI_HISTORY: Map<string, KPISnapshot[]> = new Map<string, KPISnapshot[]>();

function deriveStatus(
  value: number,
  target: number | undefined
): KPISnapshot["status"] {
  if (target === undefined) return "on_track";
  if (value >= target) return "on_track";
  if (value >= target * 0.9) return "at_risk";
  return "off_track";
}

function deriveTrend(
  value: number,
  history: KPISnapshot[]
): KPISnapshot["trend"] {
  if (history.length === 0) return "flat";
  const previous = history[history.length - 1].value;
  if (previous === 0) return "flat";
  const changePct = ((value - previous) / Math.abs(previous)) * 100;
  if (changePct > 5) return "up";
  if (changePct < -5) return "down";
  return "flat";
}

export function recordKPI(
  kpiName: string,
  value: number,
  unit: string,
  target?: number
): KPISnapshot {
  const existing = KPI_HISTORY.get(kpiName) ?? [];

  const snapshot: KPISnapshot = {
    kpiName,
    value,
    unit,
    target,
    status: deriveStatus(value, target),
    trend: deriveTrend(value, existing),
    capturedAt: new Date().toISOString(),
  };

  const updated = [...existing, snapshot];
  if (updated.length > KPI_HISTORY_CAP) {
    updated.shift();
  }
  KPI_HISTORY.set(kpiName, updated);

  return snapshot;
}

export function getKPIStatus(): KPISnapshot[] {
  return Array.from(KPI_HISTORY.entries()).map(([, snapshots]) => {
    return snapshots[snapshots.length - 1] as KPISnapshot;
  });
}

export function getOffTrackKPIs(): KPISnapshot[] {
  return getKPIStatus().filter((s) => s.status === "off_track");
}

export function getKPIHistory(kpiName: string): KPISnapshot[] {
  return KPI_HISTORY.get(kpiName) ?? [];
}
