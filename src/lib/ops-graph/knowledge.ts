export type PatternType =
  | "anomaly"
  | "workflow_optimization"
  | "escalation_pattern"
  | "seasonal"
  | "risk_correlation";

export interface OperationalPattern {
  id: string;
  type: PatternType;
  description: string;
  confidence: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  data: Record<string, unknown>;
}

const PATTERNS = new Map<string, OperationalPattern>();

export function recordPattern(
  pattern: Omit<OperationalPattern, "id" | "firstSeen" | "lastSeen">
): OperationalPattern {
  const id = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const full: OperationalPattern = {
    ...pattern,
    id,
    firstSeen: now,
    lastSeen: now,
  };
  PATTERNS.set(id, full);
  return full;
}

export function findSimilarPatterns(
  type: PatternType,
  minConfidence = 0
): OperationalPattern[] {
  return Array.from(PATTERNS.values()).filter(
    (p) => p.type === type && p.confidence >= minConfidence
  );
}

export function incrementPattern(id: string): void {
  const pattern = PATTERNS.get(id);
  if (!pattern) return;
  pattern.occurrences += 1;
  pattern.lastSeen = new Date().toISOString();
}

export function getAllPatterns(): OperationalPattern[] {
  return Array.from(PATTERNS.values());
}

export function getPatternSummary(): {
  total: number;
  byType: Record<string, number>;
  highConfidence: number;
} {
  const all = getAllPatterns();
  const byType: Record<string, number> = {};
  let highConfidence = 0;

  for (const p of all) {
    byType[p.type] = (byType[p.type] ?? 0) + 1;
    if (p.confidence >= 0.8) highConfidence += 1;
  }

  return { total: all.length, byType, highConfidence };
}
