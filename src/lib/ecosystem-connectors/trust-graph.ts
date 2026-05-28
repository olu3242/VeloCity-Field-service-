export interface EcosystemTrustEdge {
  fromSystem: string
  toSystem: string
  trustScore: number
  interactions: number
  successRate: number
  lastInteractionAt: string
}

const EDGES: Map<string, EcosystemTrustEdge> = new Map()

function edgeKey(from: string, to: string): string {
  return `${from}:${to}`
}

export function recordInteraction(
  fromSystem: string,
  toSystem: string,
  success: boolean
): EcosystemTrustEdge {
  const key = edgeKey(fromSystem, toSystem)
  const existing = EDGES.get(key)

  let edge: EcosystemTrustEdge
  if (existing) {
    const totalSuccesses = existing.successRate * existing.interactions + (success ? 1 : 0)
    const newInteractions = existing.interactions + 1
    const newSuccessRate = totalSuccesses / newInteractions
    edge = {
      ...existing,
      interactions: newInteractions,
      successRate: newSuccessRate,
      trustScore: Math.round(newSuccessRate * 100),
      lastInteractionAt: new Date().toISOString(),
    }
  } else {
    edge = {
      fromSystem,
      toSystem,
      trustScore: success ? 100 : 0,
      interactions: 1,
      successRate: success ? 1 : 0,
      lastInteractionAt: new Date().toISOString(),
    }
  }

  EDGES.set(key, edge)
  return edge
}

export function getTrustScore(fromSystem: string, toSystem: string): number {
  return EDGES.get(edgeKey(fromSystem, toSystem))?.trustScore ?? 0
}

export function getTrustedSystems(fromSystem: string, minScore = 70): EcosystemTrustEdge[] {
  return Array.from(EDGES.values()).filter(
    e => e.fromSystem === fromSystem && e.trustScore >= minScore
  )
}

export function getTrustGraph(): EcosystemTrustEdge[] {
  return Array.from(EDGES.values())
}
