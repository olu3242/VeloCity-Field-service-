/**
 * IDXF Integration — Entity Repository.
 *
 * Metadata-driven reads. Given an entity key, this builds the column list,
 * validates filters and sort keys against declared fields, and returns rows with
 * sensitive values masked — all from metadata, with no per-entity code.
 *
 * Every query runs through a caller-supplied Supabase client that is already
 * RLS-scoped, so tenant isolation is enforced by the database rather than by a
 * filter this layer could forget to apply. The repository never constructs its
 * own client and never uses the service role.
 *
 * Reads only. Writing generically would bypass the domain routes that own each
 * table's business logic — quote pricing, dispatch, payout rules — so there is
 * deliberately no create/update path here.
 */

import "@/lib/metadata";

import { getEntity, type EntityDefinition } from "@/lib/metadata/entity-registry";
import { getEntityFields, getField, type FieldMetadata } from "@/lib/metadata/field-engine";
import { calculate, createAggregateResolver } from "@/lib/calculation/calculation-runtime";

/**
 * The subset of the Supabase query builder this module uses.
 * Typed structurally so the repository does not depend on the client's concrete
 * type, and so tests can supply a fake.
 */
export interface QueryBuilder {
  select: (columns: string, options?: { count?: "exact" }) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  ilike: (column: string, pattern: string) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: <T>(onfulfilled: (value: { data: unknown; error: { message: string } | null; count?: number | null }) => T) => Promise<T>;
}

export interface RepositoryClient {
  from: (table: string) => QueryBuilder;
}

export type FilterOperator = "eq" | "in" | "gte" | "lte" | "contains";

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface ReadOptions {
  /** Fields the caller may see. Omitted means every non-sensitive field. */
  visibleFields?: string[];
  /** Reveal sensitive values. Callers must have established the right to. */
  unmaskSensitive?: boolean;
  /** Apply calculated fields to each row. */
  computeDerived?: boolean;
}

export interface ListOptions extends ReadOptions {
  filters?: Filter[];
  sortBy?: string;
  sortDescending?: boolean;
  limit?: number;
  offset?: number;
}

export interface RepositoryError {
  code: "unknown_entity" | "unknown_field" | "invalid_filter" | "query_failed" | "not_found";
  message: string;
  /** Fields the entity actually declares, when the error is about a field. */
  knownFields?: string[];
}

export type RepositoryResult<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: RepositoryError };

const MASK = "•••••";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Columns to select for an entity — declared fields only. */
export function selectColumns(entity: string, visibleFields?: string[]): string[] {
  const definition = getEntity(entity);
  if (!definition) return [];

  const allowed = visibleFields ? new Set(visibleFields) : null;
  const columns = new Set<string>([definition.primaryKeyField]);

  for (const field of getEntityFields(entity)) {
    // Calculated fields have no column to select; they are derived after read.
    if (field.readOnly && (field.formula || field.aggregate)) continue;
    if (allowed && !allowed.has(field.name)) continue;
    columns.add(field.name);
  }

  return Array.from(columns);
}

/**
 * Masks sensitive values.
 *
 * Masking happens after the read rather than by omitting the column, so the
 * shape of a row is the same whoever asks — a caller cannot infer whether a
 * sensitive field is populated from whether the key is present.
 */
function maskRow(
  entity: string,
  row: Record<string, unknown>,
  unmask: boolean
): Record<string, unknown> {
  if (unmask) return { ...row };
  const out = { ...row };
  for (const field of getEntityFields(entity)) {
    if (!field.sensitive) continue;
    if (!(field.name in out)) continue;
    const value = out[field.name];
    out[field.name] = value === null || value === undefined ? null : MASK;
  }
  return out;
}

/** Validates a filter against declared field metadata. */
function validateFilter(entity: string, filter: Filter): RepositoryError | null {
  const field: FieldMetadata | undefined = getField(entity, filter.field);
  if (!field) {
    return {
      code: "unknown_field",
      message: `'${filter.field}' is not a declared field on '${entity}'`,
      knownFields: getEntityFields(entity).map((f) => f.name),
    };
  }
  // A calculated field has no column, so the database cannot filter on it.
  if (field.readOnly && (field.formula || field.aggregate)) {
    return {
      code: "invalid_filter",
      message: `'${filter.field}' is calculated and has no stored column to filter on`,
    };
  }
  // Filtering on a masked value would let a caller confirm a secret by
  // guessing it, which masking exists to prevent.
  if (field.sensitive) {
    return {
      code: "invalid_filter",
      message: `'${filter.field}' is sensitive and cannot be filtered on`,
    };
  }
  if (filter.operator === "in" && !Array.isArray(filter.value)) {
    return { code: "invalid_filter", message: `'in' requires an array value` };
  }
  if (filter.operator === "contains" && typeof filter.value !== "string") {
    return { code: "invalid_filter", message: `'contains' requires a string value` };
  }
  return null;
}

function applyFilter(query: QueryBuilder, filter: Filter): QueryBuilder {
  switch (filter.operator) {
    case "eq": return query.eq(filter.field, filter.value);
    case "in": return query.in(filter.field, filter.value as unknown[]);
    case "gte": return query.gte(filter.field, filter.value);
    case "lte": return query.lte(filter.field, filter.value);
    case "contains":
      // Escape LIKE wildcards so a user-supplied % cannot widen the match.
      return query.ilike(filter.field, `%${String(filter.value).replace(/[%_]/g, "\\$&")}%`);
  }
}

export interface ListResult {
  entity: string;
  rows: Array<Record<string, unknown>>;
  total: number | null;
  limit: number;
  offset: number;
  /** True when more rows exist beyond this page. */
  hasMore: boolean;
  maskedFields: string[];
  appliedFilters: Filter[];
}

/** Lists rows for an entity. Tenant isolation is the client's RLS. */
export async function listEntity(
  client: RepositoryClient,
  entity: string,
  options: ListOptions = {}
): Promise<RepositoryResult<ListResult>> {
  const definition: EntityDefinition | undefined = getEntity(entity);
  if (!definition) {
    return {
      ok: false,
      data: null,
      error: { code: "unknown_entity", message: `Unknown entity '${entity}'` },
    };
  }

  const filters = options.filters ?? [];
  for (const filter of filters) {
    const error = validateFilter(entity, filter);
    if (error) return { ok: false, data: null, error };
  }

  if (options.sortBy) {
    const sortField = getField(entity, options.sortBy);
    if (!sortField) {
      return {
        ok: false,
        data: null,
        error: {
          code: "unknown_field",
          message: `Cannot sort by '${options.sortBy}' — not a declared field`,
          knownFields: getEntityFields(entity).map((f) => f.name),
        },
      };
    }
    if (sortField.readOnly && (sortField.formula || sortField.aggregate)) {
      return {
        ok: false,
        data: null,
        error: {
          code: "invalid_filter",
          message: `Cannot sort by '${options.sortBy}' — calculated fields have no stored column`,
        },
      };
    }
  }

  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, options.offset ?? 0);
  const columns = selectColumns(entity, options.visibleFields);

  let query = client.from(definition.table).select(columns.join(", "), { count: "exact" });
  for (const filter of filters) query = applyFilter(query, filter);
  if (options.sortBy) {
    query = query.order(options.sortBy, { ascending: options.sortDescending !== true });
  }
  // Fetch one extra row to detect a further page without a second query.
  query = query.range(offset, offset + limit);

  const response = await query.then((r) => r);
  if (response.error) {
    return {
      ok: false,
      data: null,
      error: { code: "query_failed", message: response.error.message },
    };
  }

  const raw = Array.isArray(response.data) ? (response.data as Array<Record<string, unknown>>) : [];
  const hasMore = raw.length > limit;
  const page = hasMore ? raw.slice(0, limit) : raw;

  const rows = page.map((row) => {
    const masked = maskRow(entity, row, options.unmaskSensitive === true);
    if (!options.computeDerived) return masked;
    // Aggregates need related rows the list query does not load, so they are
    // reported as uncomputed rather than fabricated.
    return calculate(entity, masked).record;
  });

  return {
    ok: true,
    error: null,
    data: {
      entity,
      rows,
      total: response.count ?? null,
      limit,
      offset,
      hasMore,
      maskedFields: options.unmaskSensitive
        ? []
        : getEntityFields(entity).filter((f) => f.sensitive).map((f) => f.name),
      appliedFilters: filters,
    },
  };
}

export interface ReadResult {
  entity: string;
  id: string;
  row: Record<string, unknown>;
  maskedFields: string[];
  /** Calculated fields that could not be computed, with the reason. */
  uncomputedFields: Array<{ field: string; reason: string }>;
}

/** Reads a single row by primary key. */
export async function readEntity(
  client: RepositoryClient,
  entity: string,
  id: string,
  options: ReadOptions & { relatedRows?: Record<string, Array<Record<string, unknown>>> } = {}
): Promise<RepositoryResult<ReadResult>> {
  const definition = getEntity(entity);
  if (!definition) {
    return {
      ok: false,
      data: null,
      error: { code: "unknown_entity", message: `Unknown entity '${entity}'` },
    };
  }

  const columns = selectColumns(entity, options.visibleFields);
  const response = await client
    .from(definition.table)
    .select(columns.join(", "))
    .eq(definition.primaryKeyField, id)
    .maybeSingle();

  if (response.error) {
    return {
      ok: false,
      data: null,
      error: { code: "query_failed", message: response.error.message },
    };
  }
  if (!response.data) {
    // RLS makes "does not exist" and "not visible to you" indistinguishable,
    // which is the correct behaviour — a probe must not confirm foreign ids.
    return {
      ok: false,
      data: null,
      error: { code: "not_found", message: `No ${entity} found for id '${id}'` },
    };
  }

  const masked = maskRow(entity, response.data as Record<string, unknown>, options.unmaskSensitive === true);

  let row = masked;
  const uncomputedFields: Array<{ field: string; reason: string }> = [];

  if (options.computeDerived) {
    const result = calculate(entity, masked, {
      ...(options.relatedRows ? { aggregateResolver: createAggregateResolver(options.relatedRows) } : {}),
    });
    row = result.record;
    for (const failure of result.failures) {
      uncomputedFields.push({ field: failure.field, reason: failure.error ?? "unknown" });
    }
  }

  return {
    ok: true,
    error: null,
    data: {
      entity,
      id,
      row,
      maskedFields: options.unmaskSensitive
        ? []
        : getEntityFields(entity).filter((f) => f.sensitive).map((f) => f.name),
      uncomputedFields,
    },
  };
}

/**
 * Loads related rows for one relationship.
 * Used by the related-records endpoint and to resolve aggregates.
 */
export async function loadRelated(
  client: RepositoryClient,
  targetEntity: string,
  foreignKey: string,
  recordId: string,
  options: { limit?: number; visibleFields?: string[]; unmaskSensitive?: boolean } = {}
): Promise<RepositoryResult<Array<Record<string, unknown>>>> {
  const definition = getEntity(targetEntity);
  if (!definition) {
    return {
      ok: false,
      data: null,
      error: { code: "unknown_entity", message: `Unknown entity '${targetEntity}'` },
    };
  }

  const limit = Math.min(Math.max(1, options.limit ?? 20), MAX_LIMIT);
  const columns = selectColumns(targetEntity, options.visibleFields);

  const response = await client
    .from(definition.table)
    .select(columns.join(", "))
    .eq(foreignKey, recordId)
    .range(0, limit - 1)
    .then((r) => r);

  if (response.error) {
    return {
      ok: false,
      data: null,
      error: { code: "query_failed", message: response.error.message },
    };
  }

  const raw = Array.isArray(response.data) ? (response.data as Array<Record<string, unknown>>) : [];
  return {
    ok: true,
    error: null,
    data: raw.map((row) => maskRow(targetEntity, row, options.unmaskSensitive === true)),
  };
}

export const REPOSITORY_LIMITS = { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT };
export const SENSITIVE_MASK = MASK;
