/**
 * IDXF Engines 80 & 86 — Dependency Engine / Cross Field Intelligence.
 *
 * Builds the field dependency graph for an entity from formula metadata, detects
 * circular references, and produces a topological evaluation order so a single
 * change propagates correctly through every dependent field.
 *
 * The graph is derived from metadata, so it is process-global and carries no
 * tenant dimension.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getEntityFields, isCalculatedKind, type FieldMetadata } from "@/lib/metadata/field-engine";
import { extractFieldReferences, parseFormula, type FormulaNode } from "./formula-engine";

export interface DependencyEdge {
  /** The calculated field. */
  dependent: string;
  /** A field it reads. */
  dependsOn: string;
}

export interface DependencyGraph {
  entity: string;
  /** field → fields it directly reads */
  dependencies: Map<string, Set<string>>;
  /** field → fields that directly read it */
  dependents: Map<string, Set<string>>;
  edges: DependencyEdge[];
  /** Topological order for evaluation; empty when a cycle exists. */
  evaluationOrder: string[];
  cycles: string[][];
  /** Formula fields whose expression failed to parse. */
  invalidFormulas: Array<{ field: string; error: string }>;
  /** Formula fields referencing names that are not fields on the entity. */
  unknownReferences: Array<{ field: string; reference: string }>;
  builtAt: string;
}

const GRAPH_CACHE: Map<string, DependencyGraph> = new Map();
const AST_CACHE: Map<string, FormulaNode> = new Map();

function astKey(entity: string, field: string): string {
  return `${entity}.${field}`;
}

/**
 * Detects every simple cycle reachable in the dependency graph.
 *
 * Depth-first with an explicit recursion stack: when an edge points back into
 * the current stack, the slice from that point is a cycle. Cycles matter because
 * a circular formula would otherwise recurse until the stack blows.
 */
function findCycles(dependencies: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const recorded = new Set<string>();

  const visit = (node: string): void => {
    if (onStack.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const cycle = stack.slice(start);
        // Canonicalise by rotating to the smallest member so the same loop
        // discovered from different entry points is reported once.
        const min = cycle.reduce((m, c) => (c < m ? c : m), cycle[0] as string);
        const offset = cycle.indexOf(min);
        const rotated = [...cycle.slice(offset), ...cycle.slice(0, offset)];
        const key = rotated.join("→");
        if (!recorded.has(key)) {
          recorded.add(key);
          cycles.push(rotated);
        }
      }
      return;
    }
    if (seen.has(node)) return;

    seen.add(node);
    stack.push(node);
    onStack.add(node);

    for (const next of Array.from(dependencies.get(node) ?? [])) {
      visit(next);
    }

    stack.pop();
    onStack.delete(node);
  };

  for (const node of Array.from(dependencies.keys())) visit(node);
  return cycles;
}

/**
 * Kahn's algorithm over the dependency edges.
 * Returns an order in which every field appears after everything it reads.
 * Returns an empty array when a cycle prevents a total order.
 */
function topologicalOrder(
  nodes: string[],
  dependencies: Map<string, Set<string>>
): string[] {
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node, 0);

  for (const node of nodes) {
    for (const dep of Array.from(dependencies.get(node) ?? [])) {
      if (!indegree.has(dep)) continue;
      indegree.set(node, (indegree.get(node) ?? 0) + 1);
    }
  }

  // Deterministic ordering keeps recalculation output stable between runs.
  const ready = nodes.filter((n) => (indegree.get(n) ?? 0) === 0).sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const node = ready.shift() as string;
    order.push(node);
    for (const other of nodes) {
      if (!(dependencies.get(other) ?? new Set()).has(node)) continue;
      const remaining = (indegree.get(other) ?? 0) - 1;
      indegree.set(other, remaining);
      if (remaining === 0) {
        ready.push(other);
        ready.sort();
      }
    }
  }

  return order.length === nodes.length ? order : [];
}

/** Builds (and caches) the dependency graph for an entity. */
export function buildDependencyGraph(entity: string, options?: { refresh?: boolean }): DependencyGraph {
  if (!options?.refresh) {
    const cached = GRAPH_CACHE.get(entity);
    if (cached) return cached;
  }

  const fields = getEntityFields(entity);
  const fieldNames = new Set(fields.map((f) => f.name));

  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const edges: DependencyEdge[] = [];
  const invalidFormulas: Array<{ field: string; error: string }> = [];
  const unknownReferences: Array<{ field: string; reference: string }> = [];

  for (const field of fields) {
    dependencies.set(field.name, new Set());
    dependents.set(field.name, new Set());
  }

  for (const field of fields) {
    if (!field.formula) continue;
    let references: string[];
    try {
      references = extractFieldReferences(field.formula);
      AST_CACHE.set(astKey(entity, field.name), parseFormula(field.formula));
    } catch (err) {
      invalidFormulas.push({
        field: field.name,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const reference of references) {
      if (!fieldNames.has(reference)) {
        // A formula reading a name that is not a field always evaluates to null,
        // which silently produces a wrong number rather than an error.
        unknownReferences.push({ field: field.name, reference });
        continue;
      }
      dependencies.get(field.name)?.add(reference);
      dependents.get(reference)?.add(field.name);
      edges.push({ dependent: field.name, dependsOn: reference });
    }
  }

  const cycles = findCycles(dependencies);
  const evaluationOrder = cycles.length === 0
    ? topologicalOrder(fields.map((f) => f.name), dependencies)
    : [];

  const graph: DependencyGraph = {
    entity,
    dependencies,
    dependents,
    edges,
    evaluationOrder,
    cycles,
    invalidFormulas,
    unknownReferences,
    builtAt: new Date().toISOString(),
  };

  GRAPH_CACHE.set(entity, graph);
  return graph;
}

/** Returns the cached AST for a formula field, parsing on demand. */
export function getFieldAst(entity: string, field: FieldMetadata): FormulaNode | null {
  if (!field.formula) return null;
  const key = astKey(entity, field.name);
  const cached = AST_CACHE.get(key);
  if (cached) return cached;
  try {
    const ast = parseFormula(field.formula);
    AST_CACHE.set(key, ast);
    return ast;
  } catch {
    return null;
  }
}

/**
 * Every field that must be recomputed when `changedField` changes, in dependency
 * order. This is what makes one edit propagate: travel distance → ETA → travel
 * cost → invoice → royalty → dashboard.
 */
export function getAffectedFields(entity: string, changedField: string): string[] {
  const graph = buildDependencyGraph(entity);
  const affected = new Set<string>();
  const queue = [changedField];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dependent of Array.from(graph.dependents.get(current) ?? [])) {
      if (affected.has(dependent)) continue;
      affected.add(dependent);
      queue.push(dependent);
    }
  }

  // Preserve topological order so each field is recomputed after its inputs.
  if (graph.evaluationOrder.length > 0) {
    return graph.evaluationOrder.filter((f) => affected.has(f));
  }
  return Array.from(affected).sort();
}

/** Fields the given field reads, transitively. */
export function getDependencyChain(entity: string, field: string): string[] {
  const graph = buildDependencyGraph(entity);
  const chain = new Set<string>();
  const queue = [field];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dep of Array.from(graph.dependencies.get(current) ?? [])) {
      if (chain.has(dep)) continue;
      chain.add(dep);
      queue.push(dep);
    }
  }
  return Array.from(chain).sort();
}

/** True when the entity's formula graph is sound enough to evaluate. */
export function isGraphHealthy(entity: string): boolean {
  const graph = buildDependencyGraph(entity);
  return (
    graph.cycles.length === 0 &&
    graph.invalidFormulas.length === 0 &&
    graph.unknownReferences.length === 0
  );
}

/** Serialisable view for the metadata API and certification report. */
export function describeDependencyGraph(entity: string): {
  entity: string;
  edges: DependencyEdge[];
  evaluationOrder: string[];
  cycles: string[][];
  invalidFormulas: Array<{ field: string; error: string }>;
  unknownReferences: Array<{ field: string; reference: string }>;
  healthy: boolean;
  calculatedFieldCount: number;
} {
  const graph = buildDependencyGraph(entity);
  return {
    entity: graph.entity,
    edges: graph.edges,
    evaluationOrder: graph.evaluationOrder,
    cycles: graph.cycles,
    invalidFormulas: graph.invalidFormulas,
    unknownReferences: graph.unknownReferences,
    healthy: isGraphHealthy(entity),
    calculatedFieldCount: getEntityFields(entity).filter((f) => isCalculatedKind(f.kind)).length,
  };
}

/** Drops cached graphs so the next build reflects new metadata. */
export function invalidateGraph(entity?: string): void {
  if (entity) {
    GRAPH_CACHE.delete(entity);
    for (const key of Array.from(AST_CACHE.keys())) {
      if (key.startsWith(`${entity}.`)) AST_CACHE.delete(key);
    }
    return;
  }
  GRAPH_CACHE.clear();
  AST_CACHE.clear();
}
