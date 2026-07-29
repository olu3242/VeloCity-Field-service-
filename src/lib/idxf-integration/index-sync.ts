/**
 * IDXF Integration — Search Index Sync.
 *
 * Populates the Universal Lookup search index from live rows.
 *
 * The index is in-memory and starts empty on every process boot, so without a
 * sync path `lookup()` returns nothing in production while appearing to work.
 * This module makes that population explicit and reports what it actually
 * indexed rather than assuming success.
 *
 * Rows are fetched by a caller-supplied loader that is already tenant-scoped —
 * the sync layer never queries, so it cannot widen a tenant boundary.
 */

import "@/lib/metadata";

import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getSearchableFields } from "@/lib/metadata/field-engine";
import { indexRecords, getIndexStats, clearIndex } from "@/lib/lookup/search-index";
import { logger } from "@/lib/logger";

/**
 * Fetches rows for an entity. MUST be tenant-scoped by the caller.
 * Returning null means the fetch failed, which is reported rather than being
 * treated as "no rows".
 */
export type RowLoader = (params: {
  entity: string;
  table: string;
  /** Columns the index needs — the searchable set plus key and display fields. */
  columns: string[];
  limit: number;
}) => Promise<Array<Record<string, unknown>> | null>;

export interface EntitySyncResult {
  entity: string;
  table: string;
  /** Rows returned by the loader. */
  fetched: number;
  /** Rows actually indexed — a row missing its primary key cannot be. */
  indexed: number;
  skipped: number;
  /** Fields the entity declares as searchable. */
  searchableFields: string[];
  /** True when the entity declares nothing searchable, so indexing is a no-op. */
  nothingSearchable: boolean;
  /** Set when the loader failed; the entity's index is unchanged. */
  error?: string;
  durationMs: number;
}

export interface SyncResult {
  tenantId: string;
  entities: EntitySyncResult[];
  totalIndexed: number;
  /** Entities whose load failed — their index is stale, not empty. */
  failedEntities: string[];
  /** Entities skipped because they declare no searchable fields. */
  unsearchableEntities: string[];
  indexStats: ReturnType<typeof getIndexStats>;
  durationMs: number;
  syncedAt: string;
}

/** Columns the index needs for an entity: key, display, and searchable fields. */
export function columnsForEntity(entity: string): string[] {
  const definition = getEntity(entity);
  if (!definition) return [];

  const columns = new Set<string>([definition.primaryKeyField, definition.displayField]);
  if (definition.statusField) columns.add(definition.statusField);
  for (const field of getSearchableFields(entity)) columns.add(field.name);
  return Array.from(columns);
}

/**
 * Syncs one entity's rows into the index.
 *
 * Replaces rather than merges: a stale entry for a row that was deleted or
 * renamed would otherwise linger in lookup results indefinitely.
 */
export async function syncEntity(
  entity: string,
  tenantId: string,
  loader: RowLoader,
  options: { limit?: number } = {}
): Promise<EntitySyncResult> {
  const started = Date.now();
  const definition = getEntity(entity);

  if (!definition) {
    return {
      entity,
      table: "",
      fetched: 0,
      indexed: 0,
      skipped: 0,
      searchableFields: [],
      nothingSearchable: true,
      error: `Unknown entity '${entity}'`,
      durationMs: Date.now() - started,
    };
  }

  const searchable = getSearchableFields(entity).map((f) => f.name);
  if (searchable.length === 0) {
    // Indexing an entity with nothing searchable would store documents that can
    // never match a query — report it instead of doing pointless work.
    return {
      entity,
      table: definition.table,
      fetched: 0,
      indexed: 0,
      skipped: 0,
      searchableFields: [],
      nothingSearchable: true,
      durationMs: Date.now() - started,
    };
  }

  const limit = options.limit ?? 1000;
  let rows: Array<Record<string, unknown>> | null;

  try {
    rows = await loader({
      entity,
      table: definition.table,
      columns: columnsForEntity(entity),
      limit,
    });
  } catch (err) {
    logger.warn("idxf.index-sync.load_failed", {
      entity,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      entity,
      table: definition.table,
      fetched: 0,
      indexed: 0,
      skipped: 0,
      searchableFields: searchable,
      nothingSearchable: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }

  if (rows === null) {
    // A failed load must not clear the existing index — that would replace a
    // usable-but-stale index with an empty one.
    return {
      entity,
      table: definition.table,
      fetched: 0,
      indexed: 0,
      skipped: 0,
      searchableFields: searchable,
      nothingSearchable: false,
      error: "Loader returned null — index left unchanged.",
      durationMs: Date.now() - started,
    };
  }

  clearIndex(tenantId, entity);
  const indexed = indexRecords(entity, tenantId, rows);

  return {
    entity,
    table: definition.table,
    fetched: rows.length,
    indexed,
    // A row without a string primary key cannot be addressed by lookup.
    skipped: rows.length - indexed,
    searchableFields: searchable,
    nothingSearchable: false,
    durationMs: Date.now() - started,
  };
}

/** Syncs several entities, or every registered one. */
export async function syncIndex(
  tenantId: string,
  loader: RowLoader,
  options: { entities?: string[]; limit?: number } = {}
): Promise<SyncResult> {
  const started = Date.now();
  const targets = options.entities ?? getAllEntities().map((e) => e.key);

  const results: EntitySyncResult[] = [];
  for (const entity of targets) {
    results.push(
      await syncEntity(entity, tenantId, loader, {
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
      })
    );
  }

  return {
    tenantId,
    entities: results,
    totalIndexed: results.reduce((sum, r) => sum + r.indexed, 0),
    failedEntities: results.filter((r) => r.error !== undefined).map((r) => r.entity),
    unsearchableEntities: results.filter((r) => r.nothingSearchable).map((r) => r.entity),
    indexStats: getIndexStats(tenantId),
    durationMs: Date.now() - started,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Reports index coverage for a tenant.
 *
 * An entity with a populated index is searchable; one without is not, and a
 * lookup against it returns nothing for reasons that have nothing to do with
 * the query.
 */
export function getIndexCoverage(tenantId: string): {
  tenantId: string;
  entities: Array<{
    entity: string;
    searchable: boolean;
    indexedDocuments: number;
    /** True when the entity is searchable but has no documents indexed. */
    needsSync: boolean;
  }>;
  entitiesNeedingSync: string[];
  totalDocuments: number;
} {
  const stats = getIndexStats(tenantId);

  const entities = getAllEntities().map((definition) => {
    const searchable = getSearchableFields(definition.key).length > 0;
    const indexedDocuments = stats.byEntity[definition.key] ?? 0;
    return {
      entity: definition.key,
      searchable,
      indexedDocuments,
      needsSync: searchable && indexedDocuments === 0,
    };
  });

  return {
    tenantId,
    entities,
    entitiesNeedingSync: entities.filter((e) => e.needsSync).map((e) => e.entity),
    totalDocuments: stats.documents,
  };
}
