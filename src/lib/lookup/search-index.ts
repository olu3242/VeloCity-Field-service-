/**
 * IDXF Engine 77 — Search Index.
 *
 * Tenant-partitioned inverted index over the fields each entity declares
 * `searchable`. Backs the Universal Lookup Engine's ranking without requiring an
 * external search service.
 *
 * Every entry is stored under its tenant, and every query takes a tenantId, so
 * one tenant's index can never be read through another's search.
 */

import { getSearchableFields } from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";

export interface IndexedDocument {
  id: string;
  entity: string;
  tenantId: string;
  /** Human-readable title, from the entity's displayField. */
  title: string;
  /** Concatenated searchable field values, lower-cased. */
  body: string;
  /** Per-field values retained for exact-match boosting. */
  fields: Record<string, string>;
  status?: string;
  indexedAt: string;
}

export interface ScoredDocument {
  document: IndexedDocument;
  score: number;
  matchedTerms: string[];
  /** Which signal produced the strongest contribution. */
  matchKind: "exact" | "prefix" | "token" | "fuzzy";
}

/** tenantId → (entity → (id → doc)) */
const INDEX: Map<string, Map<string, Map<string, IndexedDocument>>> = new Map();
const MAX_DOCS_PER_ENTITY = 5000;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9@.+]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function tenantBucket(tenantId: string): Map<string, Map<string, IndexedDocument>> {
  let bucket = INDEX.get(tenantId);
  if (!bucket) {
    bucket = new Map();
    INDEX.set(tenantId, bucket);
  }
  return bucket;
}

/**
 * Indexes a row using the entity's declared searchable fields.
 * Values are read from the row by field name, so what is searchable is
 * determined entirely by metadata.
 */
export function indexRecord(
  entity: string,
  tenantId: string,
  row: Record<string, unknown>
): IndexedDocument | null {
  const definition = getEntity(entity);
  if (!definition) return null;

  const id = row[definition.primaryKeyField];
  if (typeof id !== "string" || id === "") return null;

  const fields: Record<string, string> = {};
  const parts: string[] = [];

  for (const field of getSearchableFields(entity)) {
    const value = row[field.name];
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text.trim() === "") continue;
    fields[field.name] = text;
    parts.push(text);
  }

  const titleRaw = row[definition.displayField];
  const title = typeof titleRaw === "string" && titleRaw.trim() !== "" ? titleRaw : id;

  const statusRaw = definition.statusField ? row[definition.statusField] : undefined;

  const document: IndexedDocument = {
    id,
    entity,
    tenantId,
    title,
    body: parts.join(" ").toLowerCase(),
    fields,
    ...(typeof statusRaw === "string" ? { status: statusRaw } : {}),
    indexedAt: new Date().toISOString(),
  };

  const bucket = tenantBucket(tenantId);
  let entityDocs = bucket.get(entity);
  if (!entityDocs) {
    entityDocs = new Map();
    bucket.set(entity, entityDocs);
  }

  if (!entityDocs.has(id) && entityDocs.size >= MAX_DOCS_PER_ENTITY) {
    const oldest = entityDocs.keys().next().value;
    if (oldest !== undefined) entityDocs.delete(oldest);
  }

  entityDocs.set(id, document);
  return document;
}

export function indexRecords(
  entity: string,
  tenantId: string,
  rows: Array<Record<string, unknown>>
): number {
  let indexed = 0;
  for (const row of rows) {
    if (indexRecord(entity, tenantId, row)) indexed += 1;
  }
  return indexed;
}

export function removeFromIndex(entity: string, tenantId: string, id: string): boolean {
  return INDEX.get(tenantId)?.get(entity)?.delete(id) ?? false;
}

/**
 * Levenshtein distance, bounded so a long pair exits early.
 * Used only for short tokens where a typo is plausible.
 */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost
      );
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length] ?? max + 1;
}

export interface SearchOptions {
  entity?: string;
  limit?: number;
  /** Restrict to rows whose status is in the entity's activeStatuses. */
  activeOnly?: boolean;
  /** Enable bounded fuzzy matching for typo tolerance. */
  fuzzy?: boolean;
}

/**
 * Ranks indexed documents against a query.
 *
 * Scoring is normalised to 0–1 so results are comparable across entities, and
 * so a caller can apply a confidence threshold meaningfully.
 */
export function search(
  tenantId: string,
  query: string,
  options: SearchOptions = {}
): ScoredDocument[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const bucket = INDEX.get(tenantId);
  if (!bucket) return [];

  const entities = options.entity ? [options.entity] : Array.from(bucket.keys());
  const results: ScoredDocument[] = [];
  const normalisedQuery = query.trim().toLowerCase();

  for (const entityKey of entities) {
    const docs = bucket.get(entityKey);
    if (!docs) continue;

    const definition = getEntity(entityKey);
    const activeStatuses = definition?.activeStatuses ?? [];

    for (const document of Array.from(docs.values())) {
      if (
        options.activeOnly &&
        document.status !== undefined &&
        activeStatuses.length > 0 &&
        !activeStatuses.includes(document.status)
      ) {
        continue;
      }

      const titleLower = document.title.toLowerCase();
      const bodyTokens = new Set(tokenize(document.body));

      let raw = 0;
      const matched: string[] = [];
      let kind: ScoredDocument["matchKind"] = "token";

      // Whole-query exact title match is the strongest possible signal.
      if (titleLower === normalisedQuery) {
        raw += terms.length * 6;
        kind = "exact";
        matched.push(...terms);
      } else if (titleLower.startsWith(normalisedQuery)) {
        raw += terms.length * 4;
        kind = "prefix";
        matched.push(...terms);
      } else {
        for (const term of terms) {
          let termScore = 0;

          // Exact value match on any indexed field — how an id, phone or email
          // is found.
          const exactField = Object.values(document.fields).some(
            (v) => v.toLowerCase() === term
          );
          if (exactField) {
            termScore += 5;
            if (kind !== "exact") kind = "exact";
          }

          if (titleLower.includes(term)) termScore += 3;
          if (bodyTokens.has(term)) termScore += 2;
          else if (document.body.includes(term)) termScore += 1;

          if (termScore === 0 && options.fuzzy && term.length >= 4) {
            for (const token of Array.from(bodyTokens)) {
              if (Math.abs(token.length - term.length) > 2) continue;
              if (editDistance(term, token) <= (term.length >= 6 ? 2 : 1)) {
                termScore += 1;
                if (kind === "token") kind = "fuzzy";
                break;
              }
            }
          }

          if (termScore > 0) {
            raw += termScore;
            matched.push(term);
          }
        }
      }

      if (raw === 0) continue;

      // Normalise against the best achievable score for this query length.
      const maxRaw = terms.length * 6;
      let score = Math.min(1, raw / maxRaw);

      // Prefer documents matching every term over those matching one.
      const coverage = matched.length / terms.length;
      score = score * (0.6 + 0.4 * coverage);

      results.push({
        document,
        score: Number(score.toFixed(4)),
        matchedTerms: Array.from(new Set(matched)),
        matchKind: kind,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title))
    .slice(0, options.limit ?? 20);
}

export function getIndexStats(tenantId?: string): {
  tenants: number;
  documents: number;
  byEntity: Record<string, number>;
} {
  const byEntity: Record<string, number> = {};
  let documents = 0;

  const buckets = tenantId
    ? ([INDEX.get(tenantId)].filter((b): b is Map<string, Map<string, IndexedDocument>> => b !== undefined))
    : Array.from(INDEX.values());

  for (const bucket of buckets) {
    for (const [entity, docs] of Array.from(bucket.entries())) {
      byEntity[entity] = (byEntity[entity] ?? 0) + docs.size;
      documents += docs.size;
    }
  }

  return { tenants: tenantId ? buckets.length : INDEX.size, documents, byEntity };
}

/** Clears a tenant's index, or one entity within it. */
export function clearIndex(tenantId: string, entity?: string): void {
  if (entity) {
    INDEX.get(tenantId)?.delete(entity);
    return;
  }
  INDEX.delete(tenantId);
}
