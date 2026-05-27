export type SearchableEntityType =
  | "dispute"
  | "event"
  | "escalation"
  | "failure"
  | "workflow"
  | "recommendation"
  | "anomaly"
  | "log";

export interface SearchableEntity {
  id: string;
  type: SearchableEntityType;
  tenantId: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  indexedAt: string;
}

export interface SearchResult {
  entity: SearchableEntity;
  score: number;
  matchedTerms: string[];
}

const SEARCH_INDEX = new Map<string, SearchableEntity>();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+/)
    .filter((t: string) => t.length > 0);
}

export function indexEntity(entity: Omit<SearchableEntity, "indexedAt">): void {
  const full: SearchableEntity = { ...entity, indexedAt: new Date().toISOString() };
  SEARCH_INDEX.set(full.id, full);
}

export function search(
  query: string,
  options?: { tenantId?: string; type?: SearchableEntityType; limit?: number }
): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const limit = options?.limit ?? 10;
  const maxRawScore = terms.length * 3; // title×2 + content×1 per term (tags count as content weight)
  const results: SearchResult[] = [];

  for (const entity of Array.from(SEARCH_INDEX.values())) {
    if (options?.tenantId && entity.tenantId !== options.tenantId) continue;
    if (options?.type && entity.type !== options.type) continue;

    const titleTokens = tokenize(entity.title);
    const contentTokens = tokenize(entity.content);
    const tagTokens = entity.tags.flatMap((t: string) => tokenize(t));

    let rawScore = 0;
    const matchedTerms: string[] = [];

    for (const term of terms) {
      let termScore = 0;
      if (titleTokens.includes(term)) termScore += 2;
      if (contentTokens.includes(term)) termScore += 1;
      if (tagTokens.includes(term)) termScore += 1;
      if (termScore > 0) {
        rawScore += termScore;
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
      }
    }

    if (rawScore > 0) {
      const score = Math.min(1, rawScore / maxRawScore);
      results.push({ entity, score, matchedTerms });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function removeFromIndex(id: string): void {
  SEARCH_INDEX.delete(id);
}

export function getIndexStats(): {
  total: number;
  byType: Record<string, number>;
  byTenant: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byTenant: Record<string, number> = {};

  for (const entity of Array.from(SEARCH_INDEX.values())) {
    byType[entity.type] = (byType[entity.type] ?? 0) + 1;
    byTenant[entity.tenantId] = (byTenant[entity.tenantId] ?? 0) + 1;
  }

  return { total: SEARCH_INDEX.size, byType, byTenant };
}
