export interface RiskHeatmapEntry {
  dimension: string;
  riskScore: number;
  eventCount: number;
  lastUpdatedAt: string;
}

const HEATMAP: Map<string, RiskHeatmapEntry> = new Map();

export function updateHeatmap(dimension: string, riskScore: number): void {
  const existing = HEATMAP.get(dimension);
  if (existing) {
    const newCount = existing.eventCount + 1;
    existing.riskScore =
      (existing.riskScore * existing.eventCount + riskScore) / newCount;
    existing.eventCount = newCount;
    existing.lastUpdatedAt = new Date().toISOString();
  } else {
    HEATMAP.set(dimension, {
      dimension,
      riskScore,
      eventCount: 1,
      lastUpdatedAt: new Date().toISOString(),
    });
  }
}

export function getHeatmap(sortBy?: "score" | "events"): RiskHeatmapEntry[] {
  const entries = Array.from(HEATMAP.values());
  if (sortBy === "events") {
    return entries.sort((a, b) => b.eventCount - a.eventCount);
  }
  return entries.sort((a, b) => b.riskScore - a.riskScore);
}

export function getTopRiskDimensions(limit = 10): RiskHeatmapEntry[] {
  return getHeatmap("score").slice(0, limit);
}

export function getDimensionScore(dimension: string): number {
  return HEATMAP.get(dimension)?.riskScore ?? 0;
}
