export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: "in_progress" | "success" | "error";
  tags: Record<string, string | number | boolean>;
  error?: string;
}

export interface TraceContext {
  traceId: string;
  rootOperation: string;
  spans: TraceSpan[];
  totalDurationMs?: number;
  status: "in_progress" | "success" | "error" | "partial";
}

const TRACES_CAP = 1000;
const TRACES = new Map<string, TraceContext>();

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function startTrace(
  rootOperation: string,
  serviceName: string,
  tags?: Record<string, string | number | boolean>
): TraceContext {
  const traceId = generateId("trace");

  const rootSpan: TraceSpan = {
    traceId,
    spanId: generateId("span"),
    operationName: rootOperation,
    serviceName,
    startTime: new Date().toISOString(),
    status: "in_progress",
    tags: tags ?? {},
  };

  const ctx: TraceContext = {
    traceId,
    rootOperation,
    spans: [rootSpan],
    status: "in_progress",
  };

  if (TRACES.size >= TRACES_CAP) {
    const firstKey = Array.from(TRACES.keys())[0];
    if (firstKey !== undefined) TRACES.delete(firstKey);
  }

  TRACES.set(traceId, ctx);
  return ctx;
}

export function startSpan(
  traceId: string,
  operationName: string,
  serviceName: string,
  parentSpanId?: string
): TraceSpan {
  const span: TraceSpan = {
    traceId,
    spanId: generateId("span"),
    parentSpanId,
    operationName,
    serviceName,
    startTime: new Date().toISOString(),
    status: "in_progress",
    tags: {},
  };

  const ctx = TRACES.get(traceId);
  if (ctx) {
    ctx.spans.push(span);
  }

  return span;
}

export function finishSpan(
  traceId: string,
  spanId: string,
  status: "success" | "error",
  error?: string
): void {
  const ctx = TRACES.get(traceId);
  if (!ctx) return;

  const span = ctx.spans.find((s) => s.spanId === spanId);
  if (!span) return;

  const endTime = new Date().toISOString();
  span.endTime = endTime;
  span.durationMs =
    new Date(endTime).getTime() - new Date(span.startTime).getTime();
  span.status = status;
  if (error !== undefined) span.error = error;
}

export function finishTrace(
  traceId: string,
  status: "success" | "error"
): void {
  const ctx = TRACES.get(traceId);
  if (!ctx) return;

  ctx.status = status;

  const start = ctx.spans[0]?.startTime;
  if (start) {
    ctx.totalDurationMs = Date.now() - new Date(start).getTime();
  }
}

export function getTrace(traceId: string): TraceContext | undefined {
  return TRACES.get(traceId);
}

export function getRecentTraces(limit = 20): TraceContext[] {
  const all = Array.from(TRACES.values());
  return all.slice(-Math.min(limit, all.length));
}
