import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface SemanticLink {
  linkId: string; sourceContextId: string; targetContextId: string; tenantId?: string
  linkType: "causal" | "temporal" | "semantic" | "dependency" | "contradiction"
  strength: number
  bidirectional: boolean; createdAt: string
}

const LINKS: Map<string, SemanticLink[]> = new Map()
const MAX_PER_SOURCE = 20
const TOTAL_CAP = 10000

function totalLinkCount(): number {
  return Array.from(LINKS.values()).reduce((s, arr) => s + arr.length, 0)
}

export function linkContexts(
  sourceId: string, targetId: string,
  type: SemanticLink["linkType"], strength: number,
  bidirectional = false, tenantId?: string
): SemanticLink {
  void isRuntimePaused()
  const link: SemanticLink = {
    linkId: crypto.randomUUID(), sourceContextId: sourceId, targetContextId: targetId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    linkType: type, strength, bidirectional, createdAt: new Date().toISOString(),
  }
  const existing = LINKS.get(sourceId) ?? []
  existing.push(link)
  LINKS.set(sourceId, existing.slice(-MAX_PER_SOURCE))
  while (totalLinkCount() > TOTAL_CAP) {
    const firstKey = Array.from(LINKS.keys())[0]
    if (firstKey === undefined) break
    const arr = LINKS.get(firstKey)!
    arr.shift()
    if (arr.length === 0) LINKS.delete(firstKey)
  }
  logger.info("semantic-linker", { linkId: link.linkId, sourceId, targetId, type })
  return link
}

export function getLinksForContext(contextId: string): SemanticLink[] {
  return LINKS.get(contextId) ?? []
}

export function findPath(fromId: string, toId: string): string[] {
  const visited = new Set<string>()
  const queue: string[][] = [[fromId]]
  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]!
    if (current === toId) return path
    if (visited.has(current)) continue
    visited.add(current)
    for (const link of LINKS.get(current) ?? []) {
      if (!visited.has(link.targetContextId)) {
        queue.push([...path, link.targetContextId])
      }
    }
  }
  return []
}

export function getSemanticLinkSummary(): {
  totalLinks: number; byType: Record<string, number>; avgStrength: number; bidirectionalCount: number
} {
  const allLinks = Array.from(LINKS.values()).flat()
  const totalLinks = allLinks.length
  const byType: Record<string, number> = {}
  let strengthSum = 0
  let bidirectionalCount = 0
  for (const link of allLinks) {
    byType[link.linkType] = (byType[link.linkType] ?? 0) + 1
    strengthSum += link.strength
    if (link.bidirectional) bidirectionalCount++
  }
  const avgStrength = totalLinks > 0 ? strengthSum / totalLinks : 0
  return { totalLinks, byType, avgStrength, bidirectionalCount }
}
