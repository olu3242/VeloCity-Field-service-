// Lightweight W3C-compliant distributed tracing.
// Implements the traceparent header format: 00-{traceId}-{spanId}-{flags}
// No external library required — just crypto and structured logging.

import { createLogger } from "@/lib/logger";

const log = createLogger({ agentName: "tracing" });

// ── ID generation ─────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  // Node.js 18+ (required by Next.js 14) always exposes globalThis.crypto
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateTraceId(): string {
  return randomHex(16); // 32 hex chars
}

export function generateSpanId(): string {
  return randomHex(8); // 16 hex chars
}

export function generateRequestId(): string {
  return randomHex(12); // 24 hex chars
}

// ── traceparent format ─────────────────────────────────────────────────────

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

/** Encode a TraceContext as a W3C traceparent header value. */
export function encodeTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/** Parse a W3C traceparent header value. Returns null for invalid/missing. */
export function parseTraceparent(header: string | null): TraceContext | null {
  if (!header) return null;
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== "00") return null;
  if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
  if (!/^[0-9a-f]{16}$/.test(spanId)) return null;
  return {
    traceId,
    spanId,
    sampled: flags === "01",
  };
}

/** Create a child span context from a parent traceparent header. */
export function childContext(parentHeader: string | null): TraceContext {
  const parent = parseTraceparent(parentHeader);
  return {
    traceId: parent?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId,
    sampled: parent?.sampled ?? true,
  };
}

/** Start a new root trace context. */
export function rootContext(): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    sampled: true,
  };
}

// ── Span recording ─────────────────────────────────────────────────────────

export type SpanStatus = "ok" | "error";

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
}

export interface SpanOptions {
  context?: TraceContext;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanHandle {
  context: TraceContext;
  setStatus(status: SpanStatus): void;
  setAttribute(key: string, value: string | number | boolean): void;
  end(): Span;
}

export function startSpan(
  operationName: string,
  opts: SpanOptions = {}
): SpanHandle {
  const ctx = opts.context
    ? { ...opts.context, spanId: generateSpanId(), parentSpanId: opts.context.spanId }
    : rootContext();
  const startTime = Date.now();
  let status: SpanStatus = "ok";
  const attributes: Record<string, string | number | boolean> = {
    ...opts.attributes,
  };

  return {
    context: ctx,
    setStatus(s) {
      status = s;
    },
    setAttribute(k, v) {
      attributes[k] = v;
    },
    end(): Span {
      const endTime = Date.now();
      const span: Span = {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: ctx.parentSpanId,
        operationName,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        status,
        attributes,
      };
      // Emit as structured log for aggregation by any log shipper.
      log.info("span", span);
      return span;
    },
  };
}
