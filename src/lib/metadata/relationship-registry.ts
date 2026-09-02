/**
 * IDXF Engine 81 — Relationship Registry.
 *
 * Declares how entities connect. The Related Records Engine (76) walks these to
 * discover connections, the Aggregate field kind resolves against them, and the
 * relationship graph renders them.
 *
 * Relationships are metadata, not rows, so this registry is process-global.
 */

import { entityExists } from "./entity-registry";

export type RelationshipCardinality =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many";

export type RelationshipDeleteBehaviour = "cascade" | "restrict" | "detach";

export interface RelationshipDefinition {
  /** Unique name, addressed as `${from}.${name}`. */
  name: string;
  /** Owning entity key. */
  from: string;
  /** Target entity key. */
  to: string;
  cardinality: RelationshipCardinality;
  /** Field on the *target* entity that points back to `from`. */
  foreignKey: string;
  /** Name of the reciprocal relationship registered on the target entity. */
  inverseName?: string;
  /** Surfaced as a related-records section on the owning entity's workspace. */
  surfaceInWorkspace: boolean;
  /** Relative strength used when scoring relationship relevance (0–1). */
  weight: number;
  onDelete: RelationshipDeleteBehaviour;
  label: string;
  registeredAt: string;
}

export interface RelationshipInput {
  name: string;
  from: string;
  to: string;
  cardinality: RelationshipCardinality;
  foreignKey: string;
  inverseName?: string;
  surfaceInWorkspace?: boolean;
  weight?: number;
  onDelete?: RelationshipDeleteBehaviour;
  label?: string;
}

/** key: `${from}.${name}` */
const RELATIONSHIPS: Map<string, RelationshipDefinition> = new Map();

function key(from: string, name: string): string {
  return `${from}.${name}`;
}

export function registerRelationship(input: RelationshipInput): RelationshipDefinition {
  if (!input.name || input.name.trim() === "") {
    throw new Error("[IDXF/relationship-registry] relationship name is required");
  }
  if (!input.foreignKey || input.foreignKey.trim() === "") {
    throw new Error(
      `[IDXF/relationship-registry] relationship '${input.name}' requires a foreignKey`
    );
  }
  // Registering against an unknown entity yields a relationship the related
  // engine can never resolve, so reject it here rather than at traversal time.
  if (!entityExists(input.from)) {
    throw new Error(`[IDXF/relationship-registry] unknown 'from' entity: ${input.from}`);
  }
  if (!entityExists(input.to)) {
    throw new Error(`[IDXF/relationship-registry] unknown 'to' entity: ${input.to}`);
  }
  if (input.weight !== undefined && (input.weight < 0 || input.weight > 1)) {
    throw new Error(
      `[IDXF/relationship-registry] relationship '${input.name}' weight must be between 0 and 1`
    );
  }

  const definition: RelationshipDefinition = {
    name: input.name,
    from: input.from,
    to: input.to,
    cardinality: input.cardinality,
    foreignKey: input.foreignKey,
    ...(input.inverseName !== undefined ? { inverseName: input.inverseName } : {}),
    surfaceInWorkspace: input.surfaceInWorkspace ?? true,
    weight: input.weight ?? 0.5,
    onDelete: input.onDelete ?? "restrict",
    label: input.label ?? input.name,
    registeredAt: new Date().toISOString(),
  };

  RELATIONSHIPS.set(key(definition.from, definition.name), definition);
  return definition;
}

export function registerRelationships(inputs: RelationshipInput[]): RelationshipDefinition[] {
  return inputs.map(registerRelationship);
}

export function getRelationship(from: string, name: string): RelationshipDefinition | undefined {
  return RELATIONSHIPS.get(key(from, name));
}

/** Relationships owned by an entity — the outbound edges. */
export function getRelationshipsFrom(entity: string): RelationshipDefinition[] {
  return Array.from(RELATIONSHIPS.values())
    .filter((r) => r.from === entity)
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

/** Relationships pointing at an entity — the inbound edges. */
export function getRelationshipsTo(entity: string): RelationshipDefinition[] {
  return Array.from(RELATIONSHIPS.values())
    .filter((r) => r.to === entity)
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

/** Every edge touching an entity, in either direction. */
export function getConnections(entity: string): RelationshipDefinition[] {
  return Array.from(RELATIONSHIPS.values()).filter(
    (r) => r.from === entity || r.to === entity
  );
}

export function getAllRelationships(): RelationshipDefinition[] {
  return Array.from(RELATIONSHIPS.values());
}

/**
 * Breadth-first walk of the relationship graph from a root entity.
 * Returns each reachable entity with the hop distance at which it was found.
 * Depth is bounded because the graph is cyclic by design (customer → job →
 * customer), so an unbounded walk would not terminate on shape alone.
 */
export function dependencyTree(
  rootEntity: string,
  maxDepth = 3
): Array<{ entity: string; depth: number; via: string[] }> {
  const seen = new Map<string, { entity: string; depth: number; via: string[] }>();
  seen.set(rootEntity, { entity: rootEntity, depth: 0, via: [] });

  const queue: Array<{ entity: string; depth: number; via: string[] }> = [
    { entity: rootEntity, depth: 0, via: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;

    for (const rel of getRelationshipsFrom(current.entity)) {
      if (seen.has(rel.to)) continue;
      const node = {
        entity: rel.to,
        depth: current.depth + 1,
        via: [...current.via, `${rel.from}.${rel.name}`],
      };
      seen.set(rel.to, node);
      queue.push(node);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.depth - b.depth || a.entity.localeCompare(b.entity));
}

/**
 * Detects relationships whose declared inverse does not exist.
 * A dangling inverse breaks reciprocal navigation in the workspace, and is a
 * configuration error rather than a runtime one — surfaced for certification.
 */
export function findBrokenInverses(): Array<{ relationship: string; missingInverse: string }> {
  const broken: Array<{ relationship: string; missingInverse: string }> = [];
  for (const rel of Array.from(RELATIONSHIPS.values())) {
    if (!rel.inverseName) continue;
    if (!RELATIONSHIPS.has(key(rel.to, rel.inverseName))) {
      broken.push({
        relationship: key(rel.from, rel.name),
        missingInverse: key(rel.to, rel.inverseName),
      });
    }
  }
  return broken;
}

export function getRelationshipStats(): {
  total: number;
  byCardinality: Record<string, number>;
  entitiesConnected: number;
  brokenInverses: number;
} {
  const byCardinality: Record<string, number> = {};
  const entities = new Set<string>();
  for (const rel of Array.from(RELATIONSHIPS.values())) {
    byCardinality[rel.cardinality] = (byCardinality[rel.cardinality] ?? 0) + 1;
    entities.add(rel.from);
    entities.add(rel.to);
  }
  return {
    total: RELATIONSHIPS.size,
    byCardinality,
    entitiesConnected: entities.size,
    brokenInverses: findBrokenInverses().length,
  };
}
