import {
  INDEX,
  type SearchableEntityType,
  type SearchIndex,
} from "./operational-indexer";

export interface SearchResult {
  entityId: string;
  entityType: SearchableEntityType;
  title: string;
  relevanceScore: number;
  snippet: string;
  tenantId: string;
}

export interface SearchQuery {
  query: string;
  tenantId: string;
  entityType?: SearchableEntityType;
  limit?: number;
}

function countOccurrences(text: string, term: string): number {
  if (term.length === 0) return 0;
  const lower = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = lower.indexOf(lowerTerm, pos);
    if (idx === -1) break;
    count++;
    pos = idx + lowerTerm.length;
  }
  return count;
}

function scoreEntry(entry: SearchIndex, queryStr: string): number {
  const terms = queryStr.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  let raw = 0;
  for (const term of terms) {
    raw += countOccurrences(entry.title, term) * 2;
    raw += countOccurrences(entry.content, term) * 1;
  }
  const maxPossible =
    (entry.title.length + entry.content.length * 0.5) || 1;
  return Math.min(1, raw / maxPossible);
}

export function search(query: SearchQuery): SearchResult[] {
  const limit = query.limit ?? 20;
  const candidates = INDEX.filter((e) => {
    if (e.tenantId !== query.tenantId) return false;
    if (query.entityType !== undefined && e.entityType !== query.entityType)
      return false;
    return true;
  });

  return candidates
    .map((e) => ({
      entityId: e.entityId,
      entityType: e.entityType,
      title: e.title,
      relevanceScore: scoreEntry(e, query.query),
      snippet: e.content.slice(0, 100),
      tenantId: e.tenantId,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

export function searchAcrossTypes(
  tenantId: string,
  queryStr: string,
  limit = 20
): SearchResult[] {
  return search({ query: queryStr, tenantId, limit });
}

export function getIndexedEntities(
  tenantId: string,
  entityType?: SearchableEntityType
): SearchIndex[] {
  return INDEX.filter((e) => {
    if (e.tenantId !== tenantId) return false;
    if (entityType !== undefined && e.entityType !== entityType) return false;
    return true;
  });
}
