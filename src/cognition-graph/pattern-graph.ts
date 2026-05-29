import { logger } from "@/runtime-core/observability"

export interface PatternNode {
  nodeId: string
  patternType: string
  frequency: number
  tenantId?: string
  connectedPatterns: string[]
  lastSeenAt: string
  firstSeenAt: string
  maturityScore: number
}

const PATTERN_GRAPH = new Map<string, PatternNode>()
const PATTERN_GRAPH_CAP = 1000

export function observePattern(patternType: string, tenantId?: string): PatternNode {
  const existing = PATTERN_GRAPH.get(patternType)
  if (existing) {
    existing.frequency++
    existing.lastSeenAt = new Date().toISOString()
    existing.maturityScore = Math.min(100, Math.round((existing.frequency / 50) * 100))
    return existing
  }

  if (PATTERN_GRAPH.size >= PATTERN_GRAPH_CAP) {
    const firstKey = Array.from(PATTERN_GRAPH.keys())[0]
    if (firstKey !== undefined) PATTERN_GRAPH.delete(firstKey)
    logger.warn("PATTERN_GRAPH cap reached, evicted oldest entry")
  }

  const now = new Date().toISOString()
  const node: PatternNode = {
    nodeId: crypto.randomUUID(),
    patternType,
    frequency: 1,
    tenantId,
    connectedPatterns: [],
    lastSeenAt: now,
    firstSeenAt: now,
    maturityScore: 2,
  }
  PATTERN_GRAPH.set(patternType, node)
  return node
}

export function linkPatterns(patternType1: string, patternType2: string): void {
  const node1 = PATTERN_GRAPH.get(patternType1)
  const node2 = PATTERN_GRAPH.get(patternType2)
  if (node1 && !node1.connectedPatterns.includes(patternType2)) {
    node1.connectedPatterns.push(patternType2)
  }
  if (node2 && !node2.connectedPatterns.includes(patternType1)) {
    node2.connectedPatterns.push(patternType1)
  }
}

export function getMaturePatterns(minFrequency?: number): PatternNode[] {
  const threshold = minFrequency ?? 5
  return Array.from(PATTERN_GRAPH.values()).filter((n) => n.frequency >= threshold)
}

export function getPatternNeighbors(patternType: string): PatternNode[] {
  const node = PATTERN_GRAPH.get(patternType)
  if (!node) return []
  return node.connectedPatterns
    .map((pt) => PATTERN_GRAPH.get(pt))
    .filter((n): n is PatternNode => n !== undefined)
}

export function getPatternGraphSummary(): {
  totalNodes: number
  totalEdges: number
  avgFrequency: number
  maturePatterns: number
} {
  const all = Array.from(PATTERN_GRAPH.values())
  const totalNodes = all.length
  const totalEdges = all.reduce((s, n) => s + n.connectedPatterns.length, 0) / 2
  const avgFrequency = totalNodes > 0 ? all.reduce((s, n) => s + n.frequency, 0) / totalNodes : 0
  const maturePatterns = all.filter((n) => n.frequency >= 5).length
  return { totalNodes, totalEdges, avgFrequency, maturePatterns }
}
