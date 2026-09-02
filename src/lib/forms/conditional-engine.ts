/**
 * IDXF Engine 84 — Conditional Logic Engine.
 *
 * Declarative conditions expressed as data, not code:
 *
 *   IF membership = "Premium" AND country = "Nigeria" THEN show priority_scheduling
 *
 * Conditions are evaluated by walking a typed structure. No JavaScript is
 * authored or executed — these rules are operator-editable configuration, so
 * running them as code would be an injection path into the server.
 */

export type ComparisonOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false";

export const COMPARISON_OPERATORS: ComparisonOperator[] = [
  "equals", "not_equals", "greater_than", "greater_or_equal", "less_than",
  "less_or_equal", "contains", "not_contains", "starts_with", "in", "not_in",
  "is_empty", "is_not_empty", "is_true", "is_false",
];

/** Operators that take no right-hand value. */
const UNARY_OPERATORS = new Set<ComparisonOperator>([
  "is_empty", "is_not_empty", "is_true", "is_false",
]);

export interface Comparison {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
}

export type ConditionNode =
  | { type: "comparison"; comparison: Comparison }
  | { type: "all"; conditions: ConditionNode[] }
  | { type: "any"; conditions: ConditionNode[] }
  | { type: "none"; conditions: ConditionNode[] };

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

export interface ComparisonTrace {
  field: string;
  operator: ComparisonOperator;
  expected?: unknown;
  actual: unknown;
  result: boolean;
}

function evaluateComparison(
  comparison: Comparison,
  record: Record<string, unknown>,
  trace: ComparisonTrace[]
): boolean {
  const actual = record[comparison.field];
  const expected = comparison.value;
  let result: boolean;

  switch (comparison.operator) {
    case "is_empty": result = isEmpty(actual); break;
    case "is_not_empty": result = !isEmpty(actual); break;
    case "is_true": result = actual === true || actual === "true" || actual === 1; break;
    case "is_false": result = actual === false || actual === "false" || actual === 0; break;

    case "equals": result = String(actual ?? "") === String(expected ?? ""); break;
    case "not_equals": result = String(actual ?? "") !== String(expected ?? ""); break;

    case "greater_than":
    case "greater_or_equal":
    case "less_than":
    case "less_or_equal": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(expected);
      // Comparing values that are not ordered is false rather than an accidental
      // string comparison, which would make "10" < "9" true.
      if (a === null || b === null) { result = false; break; }
      if (comparison.operator === "greater_than") result = a > b;
      else if (comparison.operator === "greater_or_equal") result = a >= b;
      else if (comparison.operator === "less_than") result = a < b;
      else result = a <= b;
      break;
    }

    case "contains":
      result = String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
      break;
    case "not_contains":
      result = !String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
      break;
    case "starts_with":
      result = String(actual ?? "").toLowerCase().startsWith(String(expected ?? "").toLowerCase());
      break;

    case "in":
      result = Array.isArray(expected) && expected.some((v) => String(v) === String(actual ?? ""));
      break;
    case "not_in":
      result = !Array.isArray(expected) || !expected.some((v) => String(v) === String(actual ?? ""));
      break;

    default:
      result = false;
  }

  trace.push({
    field: comparison.field,
    operator: comparison.operator,
    ...(expected !== undefined ? { expected } : {}),
    actual,
    result,
  });

  return result;
}

function evaluateNode(
  node: ConditionNode,
  record: Record<string, unknown>,
  trace: ComparisonTrace[]
): boolean {
  switch (node.type) {
    case "comparison":
      return evaluateComparison(node.comparison, record, trace);
    case "all":
      // An empty ALL is vacuously true, matching boolean-algebra convention.
      return node.conditions.every((c) => evaluateNode(c, record, trace));
    case "any":
      // An empty ANY is false — nothing was satisfied.
      return node.conditions.length > 0 && node.conditions.some((c) => evaluateNode(c, record, trace));
    case "none":
      return !node.conditions.some((c) => evaluateNode(c, record, trace));
  }
}

export interface ConditionResult {
  matched: boolean;
  trace: ComparisonTrace[];
  /** Fields the condition read — used to decide when to re-evaluate. */
  fieldsRead: string[];
}

export function evaluateCondition(
  condition: ConditionNode,
  record: Record<string, unknown>
): ConditionResult {
  const trace: ComparisonTrace[] = [];
  const matched = evaluateNode(condition, record, trace);
  return {
    matched,
    trace,
    fieldsRead: Array.from(new Set(trace.map((t) => t.field))),
  };
}

/** Statically collects every field a condition references, without evaluating. */
export function extractConditionFields(condition: ConditionNode): string[] {
  const fields = new Set<string>();
  const walk = (node: ConditionNode): void => {
    if (node.type === "comparison") {
      fields.add(node.comparison.field);
      return;
    }
    node.conditions.forEach(walk);
  };
  walk(condition);
  return Array.from(fields).sort();
}

/**
 * Validates a condition's structure before it is stored.
 * A malformed condition would silently evaluate false and quietly disable the
 * rule it guards, so it is rejected at authoring time.
 */
export function validateCondition(
  condition: ConditionNode,
  knownFields?: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const known = knownFields ? new Set(knownFields) : null;

  const walk = (node: ConditionNode, path: string): void => {
    if (node.type === "comparison") {
      const { field, operator, value } = node.comparison;
      if (!field || field.trim() === "") {
        errors.push(`${path}: comparison is missing a field`);
      } else if (known && !known.has(field)) {
        errors.push(`${path}: unknown field '${field}'`);
      }
      if (!COMPARISON_OPERATORS.includes(operator)) {
        errors.push(`${path}: unknown operator '${operator}'`);
        return;
      }
      if (!UNARY_OPERATORS.has(operator) && value === undefined) {
        errors.push(`${path}: operator '${operator}' requires a value`);
      }
      if ((operator === "in" || operator === "not_in") && !Array.isArray(value)) {
        errors.push(`${path}: operator '${operator}' requires an array value`);
      }
      return;
    }

    if (node.conditions.length === 0) {
      errors.push(`${path}: '${node.type}' group is empty`);
      return;
    }
    node.conditions.forEach((child, i) => walk(child, `${path}.${node.type}[${i}]`));
  };

  walk(condition, "condition");
  return { valid: errors.length === 0, errors };
}

/** Renders a condition as readable text for the rules UI and audit trail. */
export function describeCondition(condition: ConditionNode): string {
  const describeComparison = (c: Comparison): string => {
    const label = c.operator.replace(/_/g, " ");
    if (UNARY_OPERATORS.has(c.operator)) return `${c.field} ${label}`;
    const value = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value);
    return `${c.field} ${label} ${value}`;
  };

  const walk = (node: ConditionNode): string => {
    if (node.type === "comparison") return describeComparison(node.comparison);
    const joiner = node.type === "any" ? " OR " : " AND ";
    const inner = node.conditions.map(walk).join(joiner);
    if (node.type === "none") return `NOT (${inner})`;
    return node.conditions.length > 1 ? `(${inner})` : inner;
  };

  return walk(condition);
}
