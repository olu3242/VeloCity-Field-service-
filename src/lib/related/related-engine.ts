/**
 * IDXF Engine 76 — Related Records Engine (RRE).
 *
 * Discovers every relationship a record participates in, from relationship
 * metadata alone. A customer automatically surfaces jobs, payments, memberships
 * and reviews; a job surfaces its customer, provider, payments and disputes —
 * with no per-entity code.
 *
 * Row fetching is delegated to a caller-supplied resolver. The caller holds the
 * tenant-scoped client, so keeping the query there keeps tenant isolation with
 * the code that owns it.
 */

import {
  getRelationshipsFrom,
  getRelationshipsTo,
  getConnections,
  dependencyTree as entityDependencyTree,
  type RelationshipDefinition,
} from "@/lib/metadata/relationship-registry";
import { getEntity } from "@/lib/metadata/entity-registry";

export type RelatedView = "cards" | "timeline" | "tree" | "graph" | "hierarchy" | "network";

export const RELATED_VIEWS: RelatedView[] = [
  "cards", "timeline", "tree", "graph", "hierarchy", "network",
];

/**
 * Fetches related rows for one relationship.
 * MUST be tenant-scoped by the caller.
 */
export type RelatedRowResolver = (params: {
  relationship: RelationshipDefinition;
  /** Id of the record whose relations are being fetched. */
  recordId: string;
  limit: number;
}) => Array<Record<string, unknown>>;

/** Counts related rows without materialising them. */
export type RelatedCountResolver = (params: {
  relationship: RelationshipDefinition;
  recordId: string;
}) => number;

export interface RelatedCard {
  id: string;
  title: string;
  entity: string;
  status?: string;
  /** ISO timestamp used to order the timeline view. */
  timestamp?: string;
  fields: Record<string, unknown>;
}

export interface RelatedSection {
  relationship: string;
  label: string;
  targetEntity: string;
  cardinality: RelationshipDefinition["cardinality"];
  weight: number;
  count: number;
  /** Populated only when a row resolver was supplied. */
  records: RelatedCard[];
  /**
   * True when rows were not fetched because no resolver was supplied.
   * An empty `records` with this flag set means "not loaded", not "none exist".
   */
  notLoaded: boolean;
}

export interface RelatedResult {
  entity: string;
  recordId: string;
  sections: RelatedSection[];
  totalRelated: number;
  view: RelatedView;
  /** Sections whose rows could not be loaded. */
  unloadedSections: string[];
  generatedAt: string;
}

export interface GetRelatedOptions {
  view?: RelatedView;
  limitPerSection?: number;
  resolveRows?: RelatedRowResolver;
  resolveCount?: RelatedCountResolver;
  /** Restrict to these relationship names. */
  only?: string[];
  /** Include relationships not marked surfaceInWorkspace. */
  includeHidden?: boolean;
}

function toCard(
  entityKey: string,
  row: Record<string, unknown>
): RelatedCard | null {
  const definition = getEntity(entityKey);
  if (!definition) return null;

  const id = row[definition.primaryKeyField];
  if (typeof id !== "string") return null;

  const titleRaw = row[definition.displayField];
  const statusRaw = definition.statusField ? row[definition.statusField] : undefined;
  const created = row.created_at ?? row.createdAt;

  return {
    id,
    entity: entityKey,
    title: typeof titleRaw === "string" && titleRaw !== "" ? titleRaw : id,
    ...(typeof statusRaw === "string" ? { status: statusRaw } : {}),
    ...(typeof created === "string" ? { timestamp: created } : {}),
    fields: row,
  };
}

/** Discovers and optionally loads every related section for a record. */
export function getRelated(
  entity: string,
  recordId: string,
  options: GetRelatedOptions = {}
): RelatedResult {
  if (!getEntity(entity)) {
    throw new Error(`[IDXF/related-engine] unknown entity: ${entity}`);
  }

  const view = options.view ?? "cards";
  const limit = options.limitPerSection ?? 10;

  let relationships = getRelationshipsFrom(entity);
  if (!options.includeHidden) {
    relationships = relationships.filter((r) => r.surfaceInWorkspace);
  }
  if (options.only && options.only.length > 0) {
    const allowed = new Set(options.only);
    relationships = relationships.filter((r) => allowed.has(r.name));
  }

  const sections: RelatedSection[] = [];
  const unloadedSections: string[] = [];
  let totalRelated = 0;

  for (const relationship of relationships) {
    const rows = options.resolveRows
      ? options.resolveRows({ relationship, recordId, limit })
      : [];

    const notLoaded = !options.resolveRows;
    if (notLoaded) unloadedSections.push(relationship.name);

    const records = rows
      .map((row) => toCard(relationship.to, row))
      .filter((c): c is RelatedCard => c !== null);

    // Prefer an explicit count so a section can report "47 jobs" while showing 10.
    const count = options.resolveCount
      ? options.resolveCount({ relationship, recordId })
      : records.length;

    totalRelated += count;

    sections.push({
      relationship: relationship.name,
      label: relationship.label,
      targetEntity: relationship.to,
      cardinality: relationship.cardinality,
      weight: relationship.weight,
      count,
      records: view === "timeline"
        ? [...records].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
        : records,
      notLoaded,
    });
  }

  return {
    entity,
    recordId,
    sections: sections.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)),
    totalRelated,
    view,
    unloadedSections,
    generatedAt: new Date().toISOString(),
  };
}

/** Counts per relationship without loading rows — the workspace tab badges. */
export function relatedCounts(
  entity: string,
  recordId: string,
  resolveCount: RelatedCountResolver
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const relationship of getRelationshipsFrom(entity)) {
    counts[relationship.name] = resolveCount({ relationship, recordId });
  }
  return counts;
}

export interface Connection {
  from: string;
  to: string;
  relationship: string;
  direction: "outbound" | "inbound";
  cardinality: RelationshipDefinition["cardinality"];
  weight: number;
}

/** Every entity-level connection touching an entity, in both directions. */
export function findConnections(entity: string): Connection[] {
  const connections: Connection[] = [];

  for (const rel of getRelationshipsFrom(entity)) {
    connections.push({
      from: rel.from,
      to: rel.to,
      relationship: rel.name,
      direction: "outbound",
      cardinality: rel.cardinality,
      weight: rel.weight,
    });
  }
  for (const rel of getRelationshipsTo(entity)) {
    connections.push({
      from: rel.from,
      to: rel.to,
      relationship: rel.name,
      direction: "inbound",
      cardinality: rel.cardinality,
      weight: rel.weight,
    });
  }

  return connections.sort((a, b) => b.weight - a.weight);
}

/** Bounded entity reachability from a root — re-exported for the workspace. */
export function dependencyTree(
  entity: string,
  maxDepth = 3
): Array<{ entity: string; depth: number; via: string[] }> {
  return entityDependencyTree(entity, maxDepth);
}

/**
 * Scores how strongly two entities relate, 0–1.
 *
 * A direct edge scores its declared weight. An indirect path decays with each
 * hop, so a two-hop connection is materially weaker than a direct one.
 */
export function relationshipScore(fromEntity: string, toEntity: string): {
  score: number;
  path: string[];
  hops: number;
  direct: boolean;
} {
  if (fromEntity === toEntity) {
    return { score: 1, path: [fromEntity], hops: 0, direct: true };
  }

  const direct = getRelationshipsFrom(fromEntity).find((r) => r.to === toEntity);
  if (direct) {
    return {
      score: Number(direct.weight.toFixed(4)),
      path: [fromEntity, toEntity],
      hops: 1,
      direct: true,
    };
  }

  // Breadth-first for the shortest path, carrying the product of edge weights.
  const queue: Array<{ entity: string; path: string[]; weight: number }> = [
    { entity: fromEntity, path: [fromEntity], weight: 1 },
  ];
  const seen = new Set<string>([fromEntity]);
  const MAX_HOPS = 4;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.path.length > MAX_HOPS) continue;

    for (const rel of getRelationshipsFrom(current.entity)) {
      if (seen.has(rel.to)) continue;
      const path = [...current.path, rel.to];
      // Each hop attenuates by 0.6 on top of the edge weight, so distance
      // meaningfully reduces relatedness rather than merely multiplying weights.
      const weight = current.weight * rel.weight * 0.6;

      if (rel.to === toEntity) {
        return {
          score: Number(weight.toFixed(4)),
          path,
          hops: path.length - 1,
          direct: false,
        };
      }

      seen.add(rel.to);
      queue.push({ entity: rel.to, path, weight });
    }
  }

  return { score: 0, path: [], hops: -1, direct: false };
}

/** Connection summary used by the certification report. */
export function describeRelatedSurface(entity: string): {
  entity: string;
  outbound: number;
  inbound: number;
  surfaced: number;
  hidden: number;
  views: RelatedView[];
} {
  const outbound = getRelationshipsFrom(entity);
  return {
    entity,
    outbound: outbound.length,
    inbound: getRelationshipsTo(entity).length,
    surfaced: outbound.filter((r) => r.surfaceInWorkspace).length,
    hidden: outbound.filter((r) => !r.surfaceInWorkspace).length,
    views: RELATED_VIEWS,
  };
}

export { getConnections };
