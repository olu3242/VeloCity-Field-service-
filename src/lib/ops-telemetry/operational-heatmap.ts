/**
 * Operational Heatmap — tracks activity intensity across dimensions.
 * In-memory singleton with rolling cap of 500 cells.
 */

const HEATMAP_CAP = 500

export interface HeatmapCell {
  dimension: string
  key: string
  value: number
  intensity: "low" | "medium" | "high" | "critical"
  updatedAt: string
}

const HEATMAP: Map<string, HeatmapCell> = new Map()

function deriveIntensity(value: number): HeatmapCell["intensity"] {
  if (value < 30) return "low"
  if (value < 60) return "medium"
  if (value < 85) return "high"
  return "critical"
}

function enforceCap(): void {
  if (HEATMAP.size >= HEATMAP_CAP) {
    const firstKey = Array.from(HEATMAP.keys())[0]
    if (firstKey !== undefined) HEATMAP.delete(firstKey)
  }
}

export function updateHeatmapCell(
  dimension: string,
  key: string,
  value: number
): HeatmapCell {
  const mapKey = `${dimension}:${key}`
  enforceCap()
  const cell: HeatmapCell = {
    dimension,
    key,
    value,
    intensity: deriveIntensity(value),
    updatedAt: new Date().toISOString(),
  }
  HEATMAP.set(mapKey, cell)
  return cell
}

export function getHeatmapByDimension(dimension: string): HeatmapCell[] {
  return Array.from(HEATMAP.values()).filter((c) => c.dimension === dimension)
}

export function getHotspots(limit = 10): HeatmapCell[] {
  return Array.from(HEATMAP.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export function getHeatmapSnapshot(): HeatmapCell[] {
  return Array.from(HEATMAP.values())
}
