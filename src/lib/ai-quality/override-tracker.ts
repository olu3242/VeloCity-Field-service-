export interface AIOverride {
  id: string;
  agentName: string;
  domain: string;
  originalRecommendation: string;
  overriddenBy: string;
  overrideReason: string;
  overrideAction: string;
  tenantId?: string;
  timestamp: string;
}

const OVERRIDES: AIOverride[] = [];
const OVERRIDES_CAP = 500;

export function recordOverride(
  override: Omit<AIOverride, "id" | "timestamp">
): AIOverride {
  const entry: AIOverride = {
    ...override,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  if (OVERRIDES.length >= OVERRIDES_CAP) OVERRIDES.shift();
  OVERRIDES.push(entry);
  return entry;
}

export function getOverridesByAgent(agentName: string): AIOverride[] {
  return OVERRIDES.filter((o) => o.agentName === agentName);
}

export function getOverrideRate(agentName: string, domain?: string): number {
  const filtered = OVERRIDES.filter(
    (o) =>
      o.agentName === agentName &&
      (domain === undefined || o.domain === domain)
  );
  return Math.min(1, filtered.length / 100);
}

export function getTopOverriddenAgents(): {
  agentName: string;
  overrideCount: number;
}[] {
  const counts = new Map<string, number>();
  for (const o of OVERRIDES) {
    counts.set(o.agentName, (counts.get(o.agentName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([agentName, overrideCount]) => ({ agentName, overrideCount }))
    .sort((a, b) => b.overrideCount - a.overrideCount);
}

export function getRecentOverrides(limit = 20): AIOverride[] {
  return OVERRIDES.slice(-limit);
}
