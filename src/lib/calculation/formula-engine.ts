/**
 * IDXF Engine 80 — Formula Engine.
 *
 * A self-contained expression language for metadata-declared calculated fields.
 *
 * Implemented as a tokenizer plus recursive-descent parser producing an AST,
 * which is then evaluated against a record. `eval` and `new Function` are never
 * used: formulas come from metadata that an operator can edit, so executing them
 * as JavaScript would be an injection path straight into the server process.
 *
 * The parser is pure and dependency-free.
 */

// ── Tokenizer ─────────────────────────────────────────────────────────────

type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "%", "<", ">", "=", "!", "&", "|"]);
const MULTI_CHAR_OPERATORS = ["<=", ">=", "==", "!=", "&&", "||", "<>"];

export class FormulaError extends Error {
  readonly position: number;
  constructor(message: string, position = -1) {
    super(position >= 0 ? `${message} (at position ${position})` : message);
    this.name = "FormulaError";
    this.position = position;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i] as string;

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "(") { tokens.push({ type: "lparen", value: ch, pos: i }); i += 1; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ch, pos: i }); i += 1; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: ch, pos: i }); i += 1; continue; }

    // String literal — single or double quoted, with backslash escapes.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i += 1;
      let value = "";
      let closed = false;
      while (i < source.length) {
        const c = source[i] as string;
        if (c === "\\" && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) { closed = true; i += 1; break; }
        value += c;
        i += 1;
      }
      if (!closed) throw new FormulaError("Unterminated string literal", start);
      tokens.push({ type: "string", value, pos: start });
      continue;
    }

    // Number literal.
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i;
      let seenDot = false;
      while (i < source.length) {
        const c = source[i] as string;
        if (c === ".") {
          if (seenDot) break;
          seenDot = true;
          i += 1;
          continue;
        }
        if (!/[0-9]/.test(c)) break;
        i += 1;
      }
      tokens.push({ type: "number", value: source.slice(start, i), pos: start });
      continue;
    }

    // Identifier — field name or function name.
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_.]/.test(source[i] as string)) i += 1;
      tokens.push({ type: "identifier", value: source.slice(start, i), pos: start });
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      const two = source.slice(i, i + 2);
      if (MULTI_CHAR_OPERATORS.includes(two)) {
        tokens.push({ type: "operator", value: two === "<>" ? "!=" : two, pos: i });
        i += 2;
        continue;
      }
      tokens.push({ type: "operator", value: ch, pos: i });
      i += 1;
      continue;
    }

    throw new FormulaError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: "eof", value: "", pos: source.length });
  return tokens;
}

// ── AST ───────────────────────────────────────────────────────────────────

export type FormulaNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "field"; name: string }
  | { type: "unary"; op: "-" | "!"; operand: FormulaNode }
  | { type: "binary"; op: string; left: FormulaNode; right: FormulaNode }
  | { type: "call"; name: string; args: FormulaNode[] };

/** Binding power per binary operator — higher binds tighter. */
const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3, "!=": 3,
  "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
};

const LITERAL_IDENTIFIERS: Record<string, FormulaNode> = {
  true: { type: "boolean", value: true },
  false: { type: "boolean", value: false },
  null: { type: "null" },
};

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.tokens[this.index] as Token;
    this.index += 1;
    return token;
  }

  private expect(type: TokenType, what: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new FormulaError(`Expected ${what} but found '${token.value || "end of input"}'`, token.pos);
    }
    return this.next();
  }

  parse(): FormulaNode {
    const node = this.parseExpression(0);
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new FormulaError(`Unexpected trailing '${trailing.value}'`, trailing.pos);
    }
    return node;
  }

  /** Precedence-climbing binary expression parser. */
  private parseExpression(minPrecedence: number): FormulaNode {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      if (token.type !== "operator") break;
      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.next();
      // All supported operators are left-associative.
      const right = this.parseExpression(precedence + 1);
      left = { type: "binary", op: token.value, left, right };
    }

    return left;
  }

  private parseUnary(): FormulaNode {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "-" || token.value === "!")) {
      this.next();
      return { type: "unary", op: token.value as "-" | "!", operand: this.parseUnary() };
    }
    if (token.type === "operator" && token.value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const token = this.next();

    if (token.type === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new FormulaError(`Invalid number '${token.value}'`, token.pos);
      return { type: "number", value };
    }

    if (token.type === "string") return { type: "string", value: token.value };

    if (token.type === "lparen") {
      const node = this.parseExpression(0);
      this.expect("rparen", "')'");
      return node;
    }

    if (token.type === "identifier") {
      // Function call.
      if (this.peek().type === "lparen") {
        this.next();
        const args: FormulaNode[] = [];
        if (this.peek().type !== "rparen") {
          for (;;) {
            args.push(this.parseExpression(0));
            if (this.peek().type === "comma") { this.next(); continue; }
            break;
          }
        }
        this.expect("rparen", "')'");
        return { type: "call", name: token.value.toUpperCase(), args };
      }

      const literal = LITERAL_IDENTIFIERS[token.value.toLowerCase()];
      if (literal) return literal;

      return { type: "field", name: token.value };
    }

    throw new FormulaError(`Unexpected token '${token.value || "end of input"}'`, token.pos);
  }
}

/** Parses a formula into an AST. Throws FormulaError on malformed input. */
export function parseFormula(source: string): FormulaNode {
  if (typeof source !== "string" || source.trim() === "") {
    throw new FormulaError("Formula is empty");
  }
  return new Parser(tokenize(source)).parse();
}

// ── Coercion helpers ──────────────────────────────────────────────────────

export type FormulaValue = number | string | boolean | null;

function toNumber(value: FormulaValue): number {
  if (value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: FormulaValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value.trim() !== "";
}

function toStringValue(value: FormulaValue): string {
  if (value === null) return "";
  return String(value);
}

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") return toNumber(a) === toNumber(b);
  if (typeof a === "boolean" || typeof b === "boolean") return toBoolean(a) === toBoolean(b);
  return String(a) === String(b);
}

// ── Function library ──────────────────────────────────────────────────────

export interface FormulaContext {
  /** Field values for the record under evaluation. */
  record: Record<string, unknown>;
  /** Fixed evaluation time, so TODAY()/NOW() are stable within one pass. */
  now: Date;
  /** Optional distance provider — supplied by the calculation runtime. */
  distanceKm?: (fromLat: number, fromLon: number, toLat: number, toLon: number) => number;
}

const MS_PER_DAY = 86_400_000;

function parseDate(value: FormulaValue): Date | null {
  if (value === null) return null;
  const parsed = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Great-circle distance in kilometres. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type FormulaFunction = (args: FormulaValue[], ctx: FormulaContext) => FormulaValue;

function requireArgs(name: string, args: FormulaValue[], min: number, max?: number): void {
  const upper = max ?? min;
  if (args.length < min || args.length > upper) {
    const expected = min === upper ? `${min}` : `${min}–${upper}`;
    throw new FormulaError(`${name}() expects ${expected} argument(s), received ${args.length}`);
  }
}

export const FORMULA_FUNCTIONS: Record<string, FormulaFunction> = {
  // Aggregation over the supplied argument list.
  SUM: (args) => args.reduce<number>((sum, v) => sum + toNumber(v), 0),
  AVG: (args) => (args.length === 0 ? 0 : args.reduce<number>((s, v) => s + toNumber(v), 0) / args.length),
  COUNT: (args) => args.filter((v) => v !== null && v !== "").length,
  MIN: (args) => (args.length === 0 ? 0 : Math.min(...args.map(toNumber))),
  MAX: (args) => (args.length === 0 ? 0 : Math.max(...args.map(toNumber))),

  // Arithmetic.
  ROUND: (args) => {
    requireArgs("ROUND", args, 1, 2);
    const digits = args.length === 2 ? Math.trunc(toNumber(args[1] ?? 0)) : 0;
    const factor = Math.pow(10, Math.max(0, Math.min(10, digits)));
    return Math.round(toNumber(args[0] ?? null) * factor) / factor;
  },
  ABS: (args) => { requireArgs("ABS", args, 1); return Math.abs(toNumber(args[0] ?? null)); },
  POWER: (args) => { requireArgs("POWER", args, 2); return Math.pow(toNumber(args[0] ?? null), toNumber(args[1] ?? null)); },
  PERCENT: (args) => {
    requireArgs("PERCENT", args, 2);
    const total = toNumber(args[1] ?? null);
    // A zero denominator yields 0 rather than Infinity — a percentage of nothing
    // is reported as nothing, not as an unbounded value.
    return total === 0 ? 0 : (toNumber(args[0] ?? null) / total) * 100;
  },
  MARGIN: (args) => {
    requireArgs("MARGIN", args, 2);
    const revenue = toNumber(args[0] ?? null);
    const cost = toNumber(args[1] ?? null);
    return revenue === 0 ? 0 : ((revenue - cost) / revenue) * 100;
  },
  ROI: (args) => {
    requireArgs("ROI", args, 2);
    const gain = toNumber(args[0] ?? null);
    const spend = toNumber(args[1] ?? null);
    return spend === 0 ? 0 : ((gain - spend) / spend) * 100;
  },
  COMMISSION: (args) => {
    requireArgs("COMMISSION", args, 2);
    return toNumber(args[0] ?? null) * toNumber(args[1] ?? null);
  },
  ROYALTY: (args) => {
    requireArgs("ROYALTY", args, 2);
    return toNumber(args[0] ?? null) * toNumber(args[1] ?? null);
  },

  // Logic.
  IF: (args) => {
    requireArgs("IF", args, 2, 3);
    return toBoolean(args[0] ?? null) ? (args[1] ?? null) : (args.length === 3 ? (args[2] ?? null) : null);
  },
  /** CASE(subject, match1, result1, [match2, result2, ...], [fallback]) */
  CASE: (args) => {
    if (args.length < 3) {
      throw new FormulaError("CASE() expects at least 3 arguments");
    }
    const subject = args[0] ?? null;
    let i = 1;
    while (i + 1 < args.length) {
      if (looseEquals(subject, args[i] ?? null)) return args[i + 1] ?? null;
      i += 2;
    }
    // A trailing odd argument is the fallback.
    return i < args.length ? (args[i] ?? null) : null;
  },
  COALESCE: (args) => args.find((v) => v !== null && v !== "") ?? null,

  // Dates.
  TODAY: (args, ctx) => {
    const d = ctx.now;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  },
  NOW: (args, ctx) => ctx.now.toISOString(),
  DATEADD: (args) => {
    requireArgs("DATEADD", args, 2);
    const base = parseDate(args[0] ?? null);
    if (!base) return null;
    return new Date(base.getTime() + toNumber(args[1] ?? null) * MS_PER_DAY).toISOString();
  },
  DATEDIFF: (args) => {
    requireArgs("DATEDIFF", args, 2);
    const a = parseDate(args[0] ?? null);
    const b = parseDate(args[1] ?? null);
    if (!a || !b) return 0;
    return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
  },

  // Domain functions.
  DISTANCE: (args, ctx) => {
    requireArgs("DISTANCE", args, 4);
    const [lat1, lon1, lat2, lon2] = args.map(toNumber);
    const fn = ctx.distanceKm ?? haversineKm;
    return fn(lat1 ?? 0, lon1 ?? 0, lat2 ?? 0, lon2 ?? 0);
  },
  /** ETA in minutes from distance (km) and average speed (km/h). */
  ETA: (args) => {
    requireArgs("ETA", args, 2);
    const distance = toNumber(args[0] ?? null);
    const speed = toNumber(args[1] ?? null);
    return speed <= 0 ? 0 : (distance / speed) * 60;
  },
  /** Linear projection: current + (current - previous) * periods. */
  FORECAST: (args) => {
    requireArgs("FORECAST", args, 3);
    const current = toNumber(args[0] ?? null);
    const previous = toNumber(args[1] ?? null);
    const periods = toNumber(args[2] ?? null);
    return current + (current - previous) * periods;
  },
  /** Weighted 0–100 score from alternating value/weight pairs. */
  SCORE: (args) => {
    if (args.length < 2 || args.length % 2 !== 0) {
      throw new FormulaError("SCORE() expects value/weight pairs");
    }
    let weighted = 0;
    let totalWeight = 0;
    for (let i = 0; i < args.length; i += 2) {
      const value = toNumber(args[i] ?? null);
      const weight = toNumber(args[i + 1] ?? null);
      weighted += value * weight;
      totalWeight += weight;
    }
    if (totalWeight === 0) return 0;
    return Math.max(0, Math.min(100, weighted / totalWeight));
  },
};

export const SUPPORTED_FUNCTIONS = Object.keys(FORMULA_FUNCTIONS).sort();

// ── Evaluation ────────────────────────────────────────────────────────────

function evaluateNode(node: FormulaNode, ctx: FormulaContext): FormulaValue {
  switch (node.type) {
    case "number": return node.value;
    case "string": return node.value;
    case "boolean": return node.value;
    case "null": return null;

    case "field": {
      const raw = ctx.record[node.name];
      if (raw === undefined || raw === null) return null;
      if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") return raw;
      // Objects and arrays have no scalar meaning in an expression; treat them
      // as absent rather than stringifying to "[object Object]".
      return null;
    }

    case "unary": {
      const value = evaluateNode(node.operand, ctx);
      return node.op === "-" ? -toNumber(value) : !toBoolean(value);
    }

    case "binary": {
      // Short-circuit before evaluating the right operand.
      if (node.op === "&&") {
        return toBoolean(evaluateNode(node.left, ctx)) ? toBoolean(evaluateNode(node.right, ctx)) : false;
      }
      if (node.op === "||") {
        return toBoolean(evaluateNode(node.left, ctx)) ? true : toBoolean(evaluateNode(node.right, ctx));
      }

      const left = evaluateNode(node.left, ctx);
      const right = evaluateNode(node.right, ctx);

      switch (node.op) {
        case "+":
          // String concatenation when either side is genuinely textual.
          if (typeof left === "string" || typeof right === "string") {
            return toStringValue(left) + toStringValue(right);
          }
          return toNumber(left) + toNumber(right);
        case "-": return toNumber(left) - toNumber(right);
        case "*": return toNumber(left) * toNumber(right);
        case "/": {
          const divisor = toNumber(right);
          // Division by zero yields 0 rather than Infinity/NaN so a single bad
          // input cannot poison every dependent field downstream.
          return divisor === 0 ? 0 : toNumber(left) / divisor;
        }
        case "%": {
          const divisor = toNumber(right);
          return divisor === 0 ? 0 : toNumber(left) % divisor;
        }
        case "==": return looseEquals(left, right);
        case "!=": return !looseEquals(left, right);
        case "<": return toNumber(left) < toNumber(right);
        case ">": return toNumber(left) > toNumber(right);
        case "<=": return toNumber(left) <= toNumber(right);
        case ">=": return toNumber(left) >= toNumber(right);
        default:
          throw new FormulaError(`Unsupported operator '${node.op}'`);
      }
    }

    case "call": {
      const fn = FORMULA_FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(`Unknown function '${node.name}()'`);
      return fn(node.args.map((arg) => evaluateNode(arg, ctx)), ctx);
    }
  }
}

export interface FormulaResult {
  ok: boolean;
  value: FormulaValue;
  error?: string;
}

/** Parses and evaluates a formula against a record. Never throws. */
export function evaluateFormula(
  source: string,
  record: Record<string, unknown>,
  options?: { now?: Date; distanceKm?: FormulaContext["distanceKm"] }
): FormulaResult {
  try {
    const ast = parseFormula(source);
    const value = evaluateNode(ast, {
      record,
      now: options?.now ?? new Date(),
      ...(options?.distanceKm ? { distanceKm: options.distanceKm } : {}),
    });
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      value: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Evaluates a pre-parsed AST — used by the runtime to avoid re-parsing. */
export function evaluateAst(
  ast: FormulaNode,
  record: Record<string, unknown>,
  options?: { now?: Date; distanceKm?: FormulaContext["distanceKm"] }
): FormulaResult {
  try {
    const value = evaluateNode(ast, {
      record,
      now: options?.now ?? new Date(),
      ...(options?.distanceKm ? { distanceKm: options.distanceKm } : {}),
    });
    return { ok: true, value };
  } catch (err) {
    return { ok: false, value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Collects every field name a formula reads — the basis of the dependency graph. */
export function extractFieldReferences(source: string): string[] {
  const names = new Set<string>();
  const walk = (node: FormulaNode): void => {
    switch (node.type) {
      case "field": names.add(node.name); break;
      case "unary": walk(node.operand); break;
      case "binary": walk(node.left); walk(node.right); break;
      case "call": node.args.forEach(walk); break;
      default: break;
    }
  };
  walk(parseFormula(source));
  return Array.from(names).sort();
}

/** Static validation used at metadata-registration and certification time. */
export function validateFormula(source: string): { valid: boolean; error?: string; references: string[] } {
  try {
    const references = extractFieldReferences(source);
    return { valid: true, references };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
      references: [],
    };
  }
}
