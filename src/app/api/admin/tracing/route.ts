// GET  /api/admin/tracing — this request's trace context, W3C header format reference
// POST /api/admin/tracing — parse_traceparent | child_context | root_context
//                           | new_ids | record_span
// Admin-only; tenant-scoped.
//
// Distributed tracing utilities. Spans emitted here are tagged with the caller's tenant so a
// trace can be attributed, and span emission is a structured log write rather than a stored
// record — the tracing lib deliberately holds no buffer, leaving aggregation to the log
// shipper.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  generateTraceId,
  generateSpanId,
  generateRequestId,
  encodeTraceparent,
  parseTraceparent,
  childContext,
  rootContext,
  startSpan,
  type SpanStatus,
  type TraceContext,
} from "@/lib/tracing/span";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SPAN_STATUSES: SpanStatus[] = ["ok", "error"];

/** Attribute values the span API accepts. */
function coerceAttributes(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
    // Objects and arrays are dropped rather than stringified — a span attribute
    // rendered as "[object Object]" is worse than an absent one.
  }
  return out;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);

  // Continue the caller's trace when they sent a traceparent, otherwise start one.
  const incoming = request.headers.get("traceparent");
  const context = childContext(incoming);

  return NextResponse.json({
    request: {
      incomingTraceparent: incoming,
      // A null incoming header means this request began the trace.
      continuedExistingTrace: parseTraceparent(incoming) !== null,
      context,
      traceparent: encodeTraceparent(context),
      requestId: generateRequestId(),
    },
    format: {
      header: "traceparent",
      spec: "W3C Trace Context",
      pattern: "00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>",
      example: encodeTraceparent(rootContext()),
    },
    supported: { spanStatuses: VALID_SPAN_STATUSES },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "parse_traceparent") {
    const { traceparent } = raw;
    if (typeof traceparent !== "string") {
      return NextResponse.json({ error: "traceparent required" }, { status: 400 });
    }
    const context = parseTraceparent(traceparent);
    if (!context) {
      // parseTraceparent returns null for a malformed header; reporting that as
      // a 400 is clearer than returning a fresh context the caller did not ask for.
      return NextResponse.json(
        {
          error: "Malformed traceparent",
          expected: "00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ action, context, success: true });
  }

  if (action === "child_context") {
    const { traceparent } = raw;
    if (traceparent !== undefined && typeof traceparent !== "string") {
      return NextResponse.json({ error: "traceparent must be a string" }, { status: 400 });
    }
    const parent = typeof traceparent === "string" ? traceparent : null;
    const context = childContext(parent);
    return NextResponse.json({
      action,
      context,
      traceparent: encodeTraceparent(context),
      // childContext silently starts a new trace when the parent is absent or
      // malformed, which would otherwise look like a continued trace.
      continuedExistingTrace: parseTraceparent(parent) !== null,
      success: true,
    });
  }

  if (action === "root_context") {
    const context: TraceContext = rootContext();
    return NextResponse.json({
      action,
      context,
      traceparent: encodeTraceparent(context),
      success: true,
    });
  }

  if (action === "new_ids") {
    return NextResponse.json({
      action,
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      requestId: generateRequestId(),
      success: true,
    });
  }

  if (action === "record_span") {
    const { operationName, traceparent, status, attributes, durationMs } = raw;
    if (typeof operationName !== "string" || operationName.trim() === "") {
      return NextResponse.json({ error: "operationName required" }, { status: 400 });
    }
    if (status !== undefined && !VALID_SPAN_STATUSES.includes(status as SpanStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_SPAN_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (durationMs !== undefined && (typeof durationMs !== "number" || durationMs < 0)) {
      return NextResponse.json({ error: "durationMs must be a non-negative number" }, { status: 400 });
    }

    const parent = typeof traceparent === "string" ? parseTraceparent(traceparent) : null;

    const handle = startSpan(operationName, {
      ...(parent ? { context: parent } : {}),
      attributes: {
        ...coerceAttributes(attributes),
        // Tenant attribution makes a span traceable back to its origin.
        "velocity.tenant_id": tenantId,
        "velocity.source": "admin_api",
      },
    });

    if (status === "error") handle.setStatus("error");
    const span = handle.end();

    return NextResponse.json(
      {
        action,
        span,
        traceparent: encodeTraceparent(handle.context),
        // The span is emitted as a structured log for the shipper to aggregate;
        // the tracing lib keeps no queryable buffer, so it cannot be read back here.
        note: "Span emitted as a structured log — the tracing library holds no queryable buffer.",
        // durationMs measures this handler's own elapsed time. A caller-supplied
        // value describes work that happened elsewhere, so it is echoed
        // separately rather than overwriting the measured figure.
        ...(typeof durationMs === "number" ? { reportedDurationMs: durationMs } : {}),
        success: true,
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'parse_traceparent', 'child_context', 'root_context', 'new_ids', or 'record_span'.`,
    },
    { status: 400 }
  );
}
