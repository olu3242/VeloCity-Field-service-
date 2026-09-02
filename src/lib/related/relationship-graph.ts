/**
 * IDXF Engine 76 — Relationship Graph.
 *
 * Renders the entity relationship model as a graph for the network, tree and
 * hierarchy views, and computes structural metrics (centrality, orphans,
 * clusters) that reveal how the data model actually hangs together.
 *
 * Operates on metadata, so it describes entity-level shape rather than any
 * tenant's rows and carries no tenant dimension.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getAllEntities, type EntityDefinition } from "@/lib/metadata/entity-registry";
import {
  getAllRelationships,
  getRelationshipsFrom,
  getRelationshipsTo,
  type RelationshipDefinition,
} from "@/lib/metadata/relationship-registry";

export interface GraphNode {
  id: string;
  label: string;
  domain: string;
  /** Outbound + inbound edge count. */
  degree: number;
  outDegree: number;
  inDegree: number;
  /** Share of all edges touching this node, 0–1. */
  centrality: number;
  isHub: boolean;
  isOrphan: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  cardinality: RelationshipDefinition["cardinality"];
  weight: number;
  /** True when the reciprocal edge is also registered. */
  bidirectional: boolean;
}

export interface RelationshipGraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    hubs: string[];
    orphans: string[];
    averageDegree: number;
  };
  generatedAt: string;
}

/** Builds the full entity relationship graph. */
export function buildGraph(): RelationshipGraphView {
  const entities: EntityDefinition[] = getAllEntities();
  const relationships = getAllRelationships();

  const edges: GraphEdge[] = relationships.map((rel) => {
    const reciprocal = relationships.some((r) => r.from === rel.to && r.to === rel.from);
    return {
      id: `${rel.from}.${rel.name}`,
      from: rel.from,
      to: rel.to,
      label: rel.label,
      cardinality: rel.cardinality,
      weight: rel.weight,
      bidirectional: reciprocal,
    };
  });

  const totalEdgeEndpoints = edges.length * 2;

  const nodes: GraphNode[] = entities.map((entity) => {
    const outDegree = getRelationshipsFrom(entity.key).length;
    const inDegree = getRelationshipsTo(entity.key).length;
    const degree = outDegree + inDegree;
    return {
      id: entity.key,
      label: entity.label,
      domain: entity.domain,
      degree,
      outDegree,
      inDegree,
      centrality: totalEdgeEndpoints === 0 ? 0 : Number((degree / totalEdgeEndpoints).toFixed(4)),
      // A hub concentrates traffic; a change to it ripples widest.
      isHub: false,
      isOrphan: degree === 0,
    };
  });

  // Hub threshold is relative to the graph, not a fixed number, so it stays
  // meaningful as the model grows.
  const averageDegree = nodes.length === 0
    ? 0
    : nodes.reduce((sum, n) => sum + n.degree, 0) / nodes.length;
  for (const node of nodes) {
    node.isHub = node.degree >= Math.max(4, averageDegree * 1.5);
  }

  // Density against the maximum possible directed edges between distinct nodes.
  const maxEdges = nodes.length * (nodes.length - 1);
  const density = maxEdges === 0 ? 0 : Number((edges.length / maxEdges).toFixed(4));

  return {
    nodes: nodes.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)),
    edges,
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density,
      hubs: nodes.filter((n) => n.isHub).map((n) => n.id),
      orphans: nodes.filter((n) => n.isOrphan).map((n) => n.id),
      averageDegree: Number(averageDegree.toFixed(2)),
    },
    generatedAt: new Date().toISOString(),
  };
}

export interface EgoGraph {
  root: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

/**
 * The neighbourhood around one entity, to a bounded depth.
 *
 * The relationship model is cyclic by design (customer → job → customer), so
 * the walk must be depth-bounded rather than relying on shape to terminate.
 */
export function buildEgoGraph(rootEntity: string, depth = 2): EgoGraph {
  const full = buildGraph();
  const nodeById = new Map(full.nodes.map((n) => [n.id, n]));

  const included = new Set<string>([rootEntity]);
  let frontier = [rootEntity];
  let truncated = false;

  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of full.edges) {
        if (edge.from === current && !included.has(edge.to)) {
          included.add(edge.to);
          next.push(edge.to);
        }
        if (edge.to === current && !included.has(edge.from)) {
          included.add(edge.from);
          next.push(edge.from);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  // Anything still on the frontier is reachable but beyond the requested depth.
  if (frontier.length > 0) truncated = true;

  return {
    root: rootEntity,
    depth,
    nodes: Array.from(included)
      .map((id) => nodeById.get(id))
      .filter((n): n is GraphNode => n !== undefined),
    edges: full.edges.filter((e) => included.has(e.from) && included.has(e.to)),
    truncated,
  };
}

export interface HierarchyNode {
  entity: string;
  label: string;
  relationship?: string;
  children: HierarchyNode[];
  /** True when this entity already appears higher in the branch. */
  cyclic: boolean;
}

/**
 * Tree projection of the graph for the hierarchy view.
 *
 * A cyclic model cannot be a tree, so a node already present on the current
 * branch is emitted as a leaf marked `cyclic` rather than being expanded —
 * that makes the loop visible instead of hiding it or recursing forever.
 */
export function buildHierarchy(rootEntity: string, maxDepth = 3): HierarchyNode {
  const entities = new Map(getAllEntities().map((e) => [e.key, e]));

  const build = (entity: string, ancestors: Set<string>, depth: number, via?: string): HierarchyNode => {
    const definition = entities.get(entity);
    const node: HierarchyNode = {
      entity,
      label: definition?.label ?? entity,
      ...(via !== undefined ? { relationship: via } : {}),
      children: [],
      cyclic: ancestors.has(entity),
    };

    if (node.cyclic || depth >= maxDepth) return node;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(entity);

    for (const rel of getRelationshipsFrom(entity)) {
      if (!rel.surfaceInWorkspace) continue;
      node.children.push(build(rel.to, nextAncestors, depth + 1, rel.name));
    }

    return node;
  };

  return build(rootEntity, new Set(), 0);
}

/**
 * Weakly-connected components — groups of entities reachable from one another
 * ignoring edge direction. More than one component means the data model has
 * genuinely disconnected islands.
 */
export function findClusters(): string[][] {
  const entities = getAllEntities().map((e) => e.key);
  const adjacency = new Map<string, Set<string>>();
  for (const entity of entities) adjacency.set(entity, new Set());

  for (const rel of getAllRelationships()) {
    adjacency.get(rel.from)?.add(rel.to);
    adjacency.get(rel.to)?.add(rel.from);
  }

  const seen = new Set<string>();
  const clusters: string[][] = [];

  for (const entity of entities) {
    if (seen.has(entity)) continue;
    const cluster: string[] = [];
    const queue = [entity];
    seen.add(entity);

    while (queue.length > 0) {
      const current = queue.shift() as string;
      cluster.push(current);
      for (const neighbour of Array.from(adjacency.get(current) ?? [])) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }

    clusters.push(cluster.sort());
  }

  return clusters.sort((a, b) => b.length - a.length);
}

/** Structural health report surfaced by certification. */
export function analyzeGraphHealth(): {
  connected: boolean;
  clusterCount: number;
  orphans: string[];
  hubs: string[];
  density: number;
  largestCluster: number;
} {
  const graph = buildGraph();
  const clusters = findClusters();
  return {
    connected: clusters.length <= 1,
    clusterCount: clusters.length,
    orphans: graph.metrics.orphans,
    hubs: graph.metrics.hubs,
    density: graph.metrics.density,
    largestCluster: clusters[0]?.length ?? 0,
  };
}
