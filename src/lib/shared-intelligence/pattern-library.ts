export interface OperationalPattern {
  id: string
  patternType: "success" | "failure" | "optimization" | "risk"
  name: string
  description: string
  occurrences: number
  lastSeenAt: string
  confidence: number
  tags: string[]
}

const PATTERNS: Map<string, OperationalPattern> = new Map()
const MAX_PATTERNS = 200

export function recordPattern(
  name: string,
  patternType: OperationalPattern["patternType"],
  description: string,
  tags: string[] = []
): OperationalPattern {
  const existing = PATTERNS.get(name)
  if (existing) {
    existing.occurrences++
    existing.lastSeenAt = new Date().toISOString()
    existing.confidence = Math.min(0.99, existing.confidence + 0.02)
    return existing
  }
  if (PATTERNS.size >= MAX_PATTERNS) {
    const firstKey = PATTERNS.keys().next().value as string
    PATTERNS.delete(firstKey)
  }
  const pattern: OperationalPattern = {
    id: crypto.randomUUID(),
    patternType,
    name,
    description,
    occurrences: 1,
    lastSeenAt: new Date().toISOString(),
    confidence: 0.5,
    tags,
  }
  PATTERNS.set(name, pattern)
  return pattern
}

export function getPattern(name: string): OperationalPattern | undefined {
  return PATTERNS.get(name)
}

export function getTopPatterns(
  patternType?: OperationalPattern["patternType"],
  limit = 10
): OperationalPattern[] {
  const all = Array.from(PATTERNS.values())
  const filtered = patternType ? all.filter((p) => p.patternType === patternType) : all
  return filtered.sort((a, b) => b.occurrences - a.occurrences).slice(0, limit)
}

export function getPatternSummary(): {
  total: number
  byType: Record<string, number>
  topPattern: OperationalPattern | undefined
} {
  const byType: Record<string, number> = {}
  for (const p of Array.from(PATTERNS.values())) {
    byType[p.patternType] = (byType[p.patternType] ?? 0) + 1
  }
  const top = getTopPatterns(undefined, 1)[0]
  return { total: PATTERNS.size, byType, topPattern: top }
}
