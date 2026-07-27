/**
 * IDXF Engine 78 — Auto Calculation Engine (ACE).
 *
 * Evaluates every calculated field on a record in dependency order, and performs
 * incremental recalculation when a single field changes.
 *
 * Aggregate fields are resolved through a caller-supplied resolver rather than a
 * direct database import: the runtime must stay pure and synchronously testable,
 * and the caller already holds a tenant-scoped client. That keeps tenant
 * isolation with the code that owns it.
 */

import {
  getEntityFields,
  isCalculatedKind,
  type AggregateSpec,
  type FieldMetadata,
} from "@/lib/metadata/field-engine";
import { evaluateAst, type FormulaValue } from "./formula-engine";
import {
  buildDependencyGraph,
  getAffectedFields,
  getFieldAst,
} from "./dependency-engine";

export interface FieldComputation {
  field: string;
  value: FormulaValue;
  ok: boolean;
  error?: string;
  /** Value before recalculation, when it differed. */
  previous?: FormulaValue;
  changed: boolean;
}

export interface CalculationResult {
  entity: string;
  /** The record with every calculated field applied. */
  record: Record<string, unknown>;
  computations: FieldComputation[];
  /** Fields whose formula failed — the record keeps its prior value for these. */
  failures: FieldComputation[];
  evaluationOrder: string[];
  cyclesDetected: string[][];
  durationMs: number;
  computedAt: string;
}

/**
 * Resolves an aggregate field. The caller supplies this because aggregation
 * requires a tenant-scoped query the pure runtime must not perform itself.
 */
export type AggregateResolver = (
  spec: AggregateSpec,
  record: Record<string, unknown>
) => number | null;

export interface CalculationOptions {
  /** Fixed evaluation time so TODAY()/NOW() are stable across the pass. */
  now?: Date;
  aggregateResolver?: AggregateResolver;
  /** Only recompute fields affected by these changes. */
  changedFields?: string[];
}

function toScalar(value: unknown): FormulaValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return null;
}

/**
 * Applies clamping declared in field validation to a computed value.
 * A score field declaring 0–100 should never surface 137 because an input drifted.
 */
function clampToFieldBounds(field: FieldMetadata, value: FormulaValue): FormulaValue {
  if (typeof value !== "number") return value;
  const { min, max } = field.validation;
  let out = value;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

function computeField(
  entity: string,
  field: FieldMetadata,
  working: Record<string, unknown>,
  options: CalculationOptions
): FieldComputation {
  const previous = toScalar(working[field.name]);

  // Aggregate fields walk a relationship rather than an expression.
  if (field.kind === "aggregate") {
    if (!field.aggregate) {
      return { field: field.name, value: previous, ok: false, error: "missing aggregate spec", changed: false };
    }
    if (!options.aggregateResolver) {
      // Without a resolver the aggregate is genuinely unknown. Returning 0 would
      // be a fabricated total, so the prior value is preserved and the omission
      // is reported instead.
      return {
        field: field.name,
        value: previous,
        ok: false,
        error: "no aggregateResolver supplied — aggregate not computed",
        changed: false,
      };
    }
    const resolved = options.aggregateResolver(field.aggregate, working);
    const value = clampToFieldBounds(field, resolved === null ? null : resolved);
    return {
      field: field.name,
      value,
      ok: true,
      changed: value !== previous,
      ...(value !== previous ? { previous } : {}),
    };
  }

  const ast = getFieldAst(entity, field);
  if (!ast) {
    return {
      field: field.name,
      value: previous,
      ok: false,
      error: field.formula ? "formula failed to parse" : "no formula declared",
      changed: false,
    };
  }

  const result = evaluateAst(ast, working, options.now ? { now: options.now } : undefined);
  if (!result.ok) {
    return {
      field: field.name,
      value: previous,
      ok: false,
      ...(result.error !== undefined ? { error: result.error } : {}),
      changed: false,
    };
  }

  const value = clampToFieldBounds(field, result.value);
  return {
    field: field.name,
    value,
    ok: true,
    changed: value !== previous,
    ...(value !== previous ? { previous } : {}),
  };
}

/**
 * Recalculates an entity's calculated fields.
 *
 * With `changedFields` supplied only the affected subtree is recomputed;
 * otherwise every calculated field is evaluated in topological order.
 */
export function calculate(
  entity: string,
  record: Record<string, unknown>,
  options: CalculationOptions = {}
): CalculationResult {
  const started = Date.now();
  const graph = buildDependencyGraph(entity);
  const fields = getEntityFields(entity);
  const byName = new Map(fields.map((f) => [f.name, f]));

  // Work on a copy so a failed pass cannot leave the caller's record half-updated.
  const working: Record<string, unknown> = { ...record };

  let targets: string[];
  if (options.changedFields && options.changedFields.length > 0) {
    const affected = new Set<string>();
    for (const changed of options.changedFields) {
      for (const field of getAffectedFields(entity, changed)) affected.add(field);
    }
    targets = graph.evaluationOrder.length > 0
      ? graph.evaluationOrder.filter((f) => affected.has(f))
      : Array.from(affected).sort();
  } else {
    const order = graph.evaluationOrder.length > 0
      ? graph.evaluationOrder
      : fields.map((f) => f.name);
    targets = order.filter((name) => {
      const field = byName.get(name);
      return field !== undefined && isCalculatedKind(field.kind);
    });
  }

  const computations: FieldComputation[] = [];

  // A cycle means no sound evaluation order exists; computing anyway would
  // produce values that depend on arbitrary iteration order.
  if (graph.cycles.length > 0) {
    return {
      entity,
      record: working,
      computations: [],
      failures: targets.map((name) => ({
        field: name,
        value: toScalar(working[name]),
        ok: false,
        error: "circular dependency detected — calculation skipped",
        changed: false,
      })),
      evaluationOrder: [],
      cyclesDetected: graph.cycles,
      durationMs: Date.now() - started,
      computedAt: new Date().toISOString(),
    };
  }

  for (const name of targets) {
    const field = byName.get(name);
    if (!field || !isCalculatedKind(field.kind)) continue;
    const computation = computeField(entity, field, working, options);
    computations.push(computation);
    // Only successful computations are written back, so a failure leaves the
    // prior value intact for downstream fields to read.
    if (computation.ok) working[name] = computation.value;
  }

  return {
    entity,
    record: working,
    computations,
    failures: computations.filter((c) => !c.ok),
    evaluationOrder: targets,
    cyclesDetected: [],
    durationMs: Date.now() - started,
    computedAt: new Date().toISOString(),
  };
}

/** Incremental recalculation after a single field edit. */
export function recalculateAfterChange(
  entity: string,
  record: Record<string, unknown>,
  changedField: string,
  newValue: unknown,
  options: Omit<CalculationOptions, "changedFields"> = {}
): CalculationResult {
  return calculate(
    entity,
    { ...record, [changedField]: newValue },
    { ...options, changedFields: [changedField] }
  );
}

/**
 * Builds an aggregate resolver over already-loaded related rows.
 * The caller fetches rows with a tenant-scoped query and hands them in, keeping
 * tenant isolation where the query lives.
 */
export function createAggregateResolver(
  relatedRows: Record<string, Array<Record<string, unknown>>>
): AggregateResolver {
  return (spec) => {
    const rows = relatedRows[spec.relationship];
    if (!rows) return null;
    if (spec.fn === "COUNT") return rows.length;
    if (!spec.field) return null;

    const values = rows
      .map((row) => row[spec.field as string])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    if (values.length === 0) {
      // COUNT of nothing is 0, but SUM/AVG/MIN/MAX of nothing is genuinely
      // undefined — returning 0 would assert a total that was never observed.
      return spec.fn === "SUM" ? 0 : null;
    }

    switch (spec.fn) {
      case "SUM": return values.reduce((s, v) => s + v, 0);
      case "AVG": return values.reduce((s, v) => s + v, 0) / values.length;
      case "MIN": return Math.min(...values);
      case "MAX": return Math.max(...values);
      default: return null;
    }
  };
}

/** Preflight check used by certification — does this entity calculate cleanly? */
export function checkCalculationHealth(entity: string): {
  entity: string;
  healthy: boolean;
  calculatedFields: number;
  cycles: string[][];
  invalidFormulas: Array<{ field: string; error: string }>;
  unknownReferences: Array<{ field: string; reference: string }>;
} {
  const graph = buildDependencyGraph(entity, { refresh: true });
  const calculatedFields = getEntityFields(entity).filter((f) => isCalculatedKind(f.kind)).length;
  return {
    entity,
    healthy:
      graph.cycles.length === 0 &&
      graph.invalidFormulas.length === 0 &&
      graph.unknownReferences.length === 0,
    calculatedFields,
    cycles: graph.cycles,
    invalidFormulas: graph.invalidFormulas,
    unknownReferences: graph.unknownReferences,
  };
}
