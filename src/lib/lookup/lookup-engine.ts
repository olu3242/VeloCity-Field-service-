/**
 * IDXF Engine 77 — Universal Lookup Engine (ULE).
 *
 * Turns every reference field into an intelligent picker. A field declaring
 * `kind: "lookup", targetEntity: "customer"` gets search, ranking, recency,
 * favorites, previews and a create-new affordance with no per-form code.
 *
 * Ranking blends four signals: text relevance from the index, the user's
 * recency, explicit favorites, and metadata-declared constraints such as
 * activeOnly. Every call is tenant-scoped.
 */

import { getEntity, type EntityDefinition } from "@/lib/metadata/entity-registry";
import {
  getEntityFields,
  getField,
  getSearchableFields,
  type FieldMetadata,
} from "@/lib/metadata/field-engine";
import { search, type IndexedDocument, type ScoredDocument } from "./search-index";
import { getRecencyBoost, getRecent, recordAccess } from "./recent-items";
import { getFavoriteBoost, getFavorites } from "./favorites";

export interface LookupResult {
  id: string;
  entity: string;
  title: string;
  /** Final blended score, 0–1. */
  score: number;
  /** Percentage form used in the match UI ("92%"). */
  confidence: number;
  matchedTerms: string[];
  matchKind: ScoredDocument["matchKind"];
  status?: string;
  isFavorite: boolean;
  /** Contribution of each ranking signal, for explainability. */
  signals: {
    relevance: number;
    recency: number;
    favorite: number;
  };
  /** Indexed field values, for the preview card. */
  preview: Record<string, string>;
}

export interface LookupRequest {
  tenantId: string;
  userId: string;
  /** Entity being searched. Derived from field metadata when using lookupForField. */
  entity: string;
  query: string;
  limit?: number;
  activeOnly?: boolean;
  fuzzy?: boolean;
}

export interface LookupResponse {
  entity: string;
  query: string;
  results: LookupResult[];
  /** Rows the user touched recently, shown before a query is typed. */
  recent: Array<{ id: string; title: string }>;
  favorites: Array<{ id: string; title: string; note?: string }>;
  totalMatches: number;
  /** True when the entity declares no searchable fields — an empty result then
   *  means "nothing is searchable", not "nothing matched". */
  noSearchableFields: boolean;
  searchedAt: string;
}

/** Weights for blending ranking signals. Relevance dominates; the rest break ties. */
const WEIGHTS = { relevance: 0.7, recency: 0.15, favorite: 0.15 };

function toResult(
  scored: ScoredDocument,
  request: LookupRequest
): LookupResult {
  const document: IndexedDocument = scored.document;
  const recency = getRecencyBoost(request.tenantId, request.userId, document.entity, document.id);
  const favorite = getFavoriteBoost(request.tenantId, request.userId, document.entity, document.id);

  const blended =
    scored.score * WEIGHTS.relevance +
    recency * WEIGHTS.recency +
    favorite * WEIGHTS.favorite;

  return {
    id: document.id,
    entity: document.entity,
    title: document.title,
    score: Number(blended.toFixed(4)),
    confidence: Math.round(blended * 100),
    matchedTerms: scored.matchedTerms,
    matchKind: scored.matchKind,
    ...(document.status !== undefined ? { status: document.status } : {}),
    isFavorite: favorite > 0,
    signals: {
      relevance: Number(scored.score.toFixed(4)),
      recency: Number(recency.toFixed(4)),
      favorite,
    },
    preview: document.fields,
  };
}

/** Core lookup against an entity. */
export function lookup(request: LookupRequest): LookupResponse {
  const definition = getEntity(request.entity);
  if (!definition) {
    throw new Error(`[IDXF/lookup-engine] unknown entity: ${request.entity}`);
  }

  const searchable = getSearchableFields(request.entity);
  const trimmed = request.query.trim();

  const scored = trimmed === ""
    ? []
    : search(request.tenantId, trimmed, {
        entity: request.entity,
        limit: (request.limit ?? 10) * 3,
        ...(request.activeOnly !== undefined ? { activeOnly: request.activeOnly } : {}),
        ...(request.fuzzy !== undefined ? { fuzzy: request.fuzzy } : {}),
      });

  const results = scored
    .map((s) => toResult(s, request))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, request.limit ?? 10);

  return {
    entity: request.entity,
    query: trimmed,
    results,
    recent: getRecent(request.tenantId, request.userId, { entity: request.entity, limit: 5 }).map(
      (r) => ({ id: r.recordId, title: r.title })
    ),
    favorites: getFavorites(request.tenantId, request.userId, request.entity).map((f) => ({
      id: f.recordId,
      title: f.title,
      ...(f.note !== undefined ? { note: f.note } : {}),
    })),
    totalMatches: scored.length,
    noSearchableFields: searchable.length === 0,
    searchedAt: new Date().toISOString(),
  };
}

/**
 * Lookup driven entirely by field metadata.
 *
 * The target entity and activeOnly constraint come from the field descriptor, so
 * a form never has to restate them — and cannot restate them inconsistently.
 */
export function lookupForField(
  entity: string,
  fieldName: string,
  request: Omit<LookupRequest, "entity" | "activeOnly">
): LookupResponse & { field: string; targetEntity: string } {
  const field: FieldMetadata | undefined = getField(entity, fieldName);
  if (!field) {
    throw new Error(`[IDXF/lookup-engine] unknown field: ${entity}.${fieldName}`);
  }
  if (!field.targetEntity) {
    throw new Error(
      `[IDXF/lookup-engine] field '${entity}.${fieldName}' is not a reference field`
    );
  }

  const response = lookup({
    ...request,
    entity: field.targetEntity,
    // activeOnly is metadata, not a caller choice — a form cannot widen it.
    ...(field.validation.activeOnly ? { activeOnly: true } : {}),
  });

  return { ...response, field: fieldName, targetEntity: field.targetEntity };
}

/**
 * Ranked suggestions with no query typed — favorites first, then recency.
 * This is what a lookup field shows the moment it receives focus.
 */
export function recommended(
  tenantId: string,
  userId: string,
  entity: string,
  limit = 5
): Array<{ id: string; title: string; reason: "favorite" | "recent" }> {
  const out: Array<{ id: string; title: string; reason: "favorite" | "recent" }> = [];
  const seen = new Set<string>();

  for (const favorite of getFavorites(tenantId, userId, entity)) {
    if (out.length >= limit) break;
    out.push({ id: favorite.recordId, title: favorite.title, reason: "favorite" });
    seen.add(favorite.recordId);
  }

  for (const item of getRecent(tenantId, userId, { entity, limit: limit * 2 })) {
    if (out.length >= limit) break;
    if (seen.has(item.recordId)) continue;
    out.push({ id: item.recordId, title: item.title, reason: "recent" });
    seen.add(item.recordId);
  }

  return out;
}

/**
 * Records that a user opened a row, feeding future recency ranking.
 * Called by the workspace and by lookup selection.
 */
export function registerSelection(
  tenantId: string,
  userId: string,
  entity: string,
  recordId: string,
  title: string
): void {
  recordAccess(tenantId, userId, entity, recordId, title);
}

export interface QuickPreview {
  id: string;
  entity: string;
  title: string;
  /** Field label → display value, honouring sensitivity masking. */
  summary: Record<string, string>;
  status?: string;
}

/**
 * Compact preview for the lookup hover card.
 *
 * `visibleFields` is supplied by the caller after resolving persona permissions —
 * the lookup layer must not decide what a user may see.
 */
export function quickPreview(
  entity: string,
  row: Record<string, unknown>,
  visibleFields: string[]
): QuickPreview | null {
  const definition: EntityDefinition | undefined = getEntity(entity);
  if (!definition) return null;

  const id = row[definition.primaryKeyField];
  if (typeof id !== "string") return null;

  const summary: Record<string, string> = {};
  for (const name of visibleFields) {
    const field = getField(entity, name);
    if (!field) continue;
    const value = row[name];
    if (value === null || value === undefined || value === "") continue;
    // Sensitive values never appear in a preview card even when the persona may
    // read them on the record itself — a hover card is too easy to shoulder-surf.
    summary[field.label] = field.sensitive ? "•••••" : String(value);
  }

  const titleRaw = row[definition.displayField];
  const statusRaw = definition.statusField ? row[definition.statusField] : undefined;

  return {
    id,
    entity,
    title: typeof titleRaw === "string" && titleRaw !== "" ? titleRaw : id,
    summary,
    ...(typeof statusRaw === "string" ? { status: statusRaw } : {}),
  };
}

/**
 * Describes what creating a new row inline would require — the minimum fields a
 * "create new" affordance must collect to satisfy validation.
 */
export function createNewSpec(entity: string): {
  entity: string;
  requiredFields: Array<{ name: string; label: string; kind: string }>;
  displayField: string;
} | null {
  const definition = getEntity(entity);
  if (!definition) return null;

  return {
    entity,
    // Every required, writable field — not just the searchable ones, or the
    // created row would fail validation on a field the form never collected.
    requiredFields: getEntityFields(entity)
      .filter((f) => f.validation.required && !f.readOnly)
      .map((f) => ({ name: f.name, label: f.label, kind: f.kind })),
    displayField: definition.displayField,
  };
}
