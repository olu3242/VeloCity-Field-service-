export interface CapacityRecommendation {
  resourceType: string
  currentCapacity: number
  recommendedCapacity: number
  utilizationPct: number
  wasteScore: number
  savingsEstimateUsd: number
  generatedAt: string
}

const RECS: CapacityRecommendation[] = []
const RECS_CAP = 50

export function generateCapacityRecommendation(
  resourceType: string,
  currentCapacity: number,
  currentUsage: number,
  costPerUnitUsd: number,
): CapacityRecommendation {
  const recommendedCapacity = Math.ceil(currentUsage * 1.2)
  const utilizationPct = currentCapacity > 0 ? (currentUsage / currentCapacity) * 100 : 0
  const wasteScore = Math.max(
    0,
    currentCapacity > 0
      ? ((currentCapacity - recommendedCapacity) / currentCapacity) * 100
      : 0,
  )
  const savingsEstimateUsd = Math.max(0, currentCapacity - recommendedCapacity) * costPerUnitUsd

  const rec: CapacityRecommendation = {
    resourceType,
    currentCapacity,
    recommendedCapacity,
    utilizationPct,
    wasteScore,
    savingsEstimateUsd,
    generatedAt: new Date().toISOString(),
  }
  RECS.push(rec)
  if (RECS.length > RECS_CAP) RECS.splice(0, RECS.length - RECS_CAP)
  return rec
}

export function getAllRecommendations(): CapacityRecommendation[] {
  return [...RECS]
}

export function getWastedResources(threshold = 20): CapacityRecommendation[] {
  return RECS.filter((r) => r.wasteScore > threshold)
}
