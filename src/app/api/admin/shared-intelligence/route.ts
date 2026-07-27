// GET  /api/admin/shared-intelligence — signals visible to this tenant, knowledge base, patterns
// POST /api/admin/shared-intelligence — publish_signal | broadcast_signal | signals_by_type
//                                       | signals_by_tag | synthesize | knowledge_by_topic
//                                       | record_pattern | get_pattern | top_patterns
// Admin-only. Signals carry an optional tenantId — tenant-scoped signals stay private to their
// owner, while signals published without one are platform-wide and visible to all. The
// knowledge base and pattern library are shared network assets with no tenant dimension.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  publishSignal,
  broadcastSignal,
  getSignalsByType,
  getSignalsByTag,
  getUnbroadcastedSignals,
  getNetworkSummary,
  type IntelligenceSignal,
} from "@/lib/shared-intelligence/intelligence-hub";
import {
  synthesize,
  getKnowledgeByTopic,
  getActionableKnowledge,
  getKnowledgeSummary,
} from "@/lib/shared-intelligence/knowledge-synthesizer";
import {
  recordPattern,
  getPattern,
  getTopPatterns,
  getPatternSummary,
  type OperationalPattern,
} from "@/lib/shared-intelligence/pattern-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SIGNAL_TYPES: IntelligenceSignal["signalType"][] = [
  "anomaly", "trend", "prediction", "recommendation", "alert",
];
const VALID_PATTERN_TYPES: OperationalPattern["patternType"][] = [
  "success", "failure", "optimization", "risk",
];

// A signal is visible if it is platform-wide (no tenantId) or owned by this tenant.
function visible(signal: IntelligenceSignal, tenantId: string): boolean {
  return signal.tenantId === undefined || signal.tenantId === tenantId;
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

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const signalType = url.searchParams.get("signalType") as IntelligenceSignal["signalType"] | null;
  const tag = url.searchParams.get("tag");
  const topic = url.searchParams.get("topic");
  const patternType = url.searchParams.get("patternType") as OperationalPattern["patternType"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    signals: {
      unbroadcasted: getUnbroadcastedSignals().filter((s) => visible(s, tenantId)),
      ...(signalType && VALID_SIGNAL_TYPES.includes(signalType)
        ? { byType: getSignalsByType(signalType, limit).filter((s) => visible(s, tenantId)) }
        : {}),
      ...(tag ? { byTag: getSignalsByTag(tag).filter((s) => visible(s, tenantId)) } : {}),
      // The network summary counts every tenant's signals.
      ...(isSuperAdmin ? { networkSummary: getNetworkSummary() } : {}),
    },
    knowledge: {
      actionable: getActionableKnowledge(),
      summary: getKnowledgeSummary(),
      ...(topic ? { byTopic: getKnowledgeByTopic(topic) ?? null } : {}),
    },
    patterns: {
      top: getTopPatterns(
        patternType && VALID_PATTERN_TYPES.includes(patternType) ? patternType : undefined,
        limit
      ),
      summary: getPatternSummary(),
    },
    supported: {
      signalTypes: VALID_SIGNAL_TYPES,
      patternTypes: VALID_PATTERN_TYPES,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
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

  // ── Intelligence hub ────────────────────────────────────────────────────

  if (action === "publish_signal") {
    const { signalType, source, confidence, payload, tags, platformWide } = raw;
    if (!VALID_SIGNAL_TYPES.includes(signalType as IntelligenceSignal["signalType"])) {
      return NextResponse.json(
        { error: `signalType must be one of: ${VALID_SIGNAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof source !== "string" || source.trim() === "") {
      return NextResponse.json({ error: "source required" }, { status: 400 });
    }
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
      return NextResponse.json({ error: "confidence must be a number" }, { status: 400 });
    }
    // Publishing without a tenantId makes the signal visible to every tenant, so
    // that must be a deliberate super_admin act rather than an omitted field.
    if (platformWide === true && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — platform-wide signals require super_admin" },
        { status: 403 }
      );
    }
    const signal = publishSignal(
      signalType as IntelligenceSignal["signalType"],
      source,
      confidence,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      Array.isArray(tags) ? (tags as string[]) : [],
      platformWide === true ? undefined : tenantId
    );
    return NextResponse.json({ action: "publish_signal", signal, success: true }, { status: 201 });
  }

  if (action === "broadcast_signal") {
    const { id } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // broadcastSignal takes no tenant argument — confirm the signal is visible to
    // this tenant before flipping it, so one tenant cannot broadcast another's.
    const signal = getUnbroadcastedSignals().find((s) => s.id === id);
    if (!signal || !visible(signal, tenantId)) {
      return NextResponse.json(
        { error: "Unbroadcasted signal not found for this tenant" },
        { status: 404 }
      );
    }
    broadcastSignal(id);
    return NextResponse.json({ action: "broadcast_signal", id, success: true });
  }

  if (action === "signals_by_type" || action === "signals_by_tag") {
    const { signalType, tag, limit } = raw;
    const capped = typeof limit === "number" ? Math.min(limit, 100) : 100;

    if (action === "signals_by_tag") {
      if (typeof tag !== "string" || tag.trim() === "") {
        return NextResponse.json({ error: "tag required" }, { status: 400 });
      }
      return NextResponse.json({
        action: "signals_by_tag",
        signals: getSignalsByTag(tag).filter((s) => visible(s, tenantId)),
        success: true,
      });
    }

    if (!VALID_SIGNAL_TYPES.includes(signalType as IntelligenceSignal["signalType"])) {
      return NextResponse.json(
        { error: `signalType must be one of: ${VALID_SIGNAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "signals_by_type",
      signals: getSignalsByType(
        signalType as IntelligenceSignal["signalType"],
        capped
      ).filter((s) => visible(s, tenantId)),
      success: true,
    });
  }

  // ── Knowledge synthesizer ───────────────────────────────────────────────

  if (action === "synthesize") {
    const { topic, sources } = raw;
    if (typeof topic !== "string" || topic.trim() === "") {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    if (!Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json({ error: "sources must be a non-empty array" }, { status: 400 });
    }

    const parsed: { content: string; confidence: number }[] = [];
    for (const entry of sources) {
      if (!entry || typeof entry !== "object") {
        return NextResponse.json({ error: "each source must be an object" }, { status: 400 });
      }
      const s = entry as Record<string, unknown>;
      if (typeof s.content !== "string" || s.content.trim() === "") {
        return NextResponse.json({ error: "each source requires content" }, { status: 400 });
      }
      if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1) {
        return NextResponse.json(
          { error: "each source requires a confidence between 0 and 1" },
          { status: 400 }
        );
      }
      parsed.push({ content: s.content, confidence: s.confidence });
    }

    const knowledge = synthesize(topic, parsed);
    return NextResponse.json(
      {
        action: "synthesize",
        knowledge,
        // Confidence is scaled by sourceCount/3, so fewer than three sources can
        // never reach the actionable threshold however confident each one is.
        ...(parsed.length < 3
          ? { note: "Fewer than 3 sources — confidence is scaled down and cannot be actionable." }
          : {}),
        success: true,
      },
      { status: 201 }
    );
  }

  if (action === "knowledge_by_topic") {
    const { topic } = raw;
    if (typeof topic !== "string" || topic.trim() === "") {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    const knowledge = getKnowledgeByTopic(topic);
    if (!knowledge) {
      return NextResponse.json({ error: `No knowledge synthesized for topic: ${topic}` }, { status: 404 });
    }
    return NextResponse.json({ action: "knowledge_by_topic", knowledge, success: true });
  }

  // ── Pattern library ─────────────────────────────────────────────────────

  if (action === "record_pattern") {
    const { name, patternType, description, tags } = raw;
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!VALID_PATTERN_TYPES.includes(patternType as OperationalPattern["patternType"])) {
      return NextResponse.json(
        { error: `patternType must be one of: ${VALID_PATTERN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    const existing = getPattern(name);
    const pattern = recordPattern(
      name,
      patternType as OperationalPattern["patternType"],
      description,
      Array.isArray(tags) ? (tags as string[]) : []
    );
    // Patterns are keyed by name: a repeat call increments the existing entry and
    // leaves its original type and description intact rather than creating a new one.
    return NextResponse.json(
      {
        action: "record_pattern",
        pattern,
        reinforced: existing !== undefined,
        ...(existing !== undefined && existing.patternType !== patternType
          ? {
              note: `Existing pattern retains type '${existing.patternType}' — the supplied type was not applied.`,
            }
          : {}),
        success: true,
      },
      { status: existing ? 200 : 201 }
    );
  }

  if (action === "get_pattern") {
    const { name } = raw;
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const pattern = getPattern(name);
    if (!pattern) {
      return NextResponse.json({ error: `Unknown pattern: ${name}` }, { status: 404 });
    }
    return NextResponse.json({ action: "get_pattern", pattern, success: true });
  }

  if (action === "top_patterns") {
    const { patternType, limit } = raw;
    if (patternType !== undefined && !VALID_PATTERN_TYPES.includes(patternType as OperationalPattern["patternType"])) {
      return NextResponse.json(
        { error: `patternType must be one of: ${VALID_PATTERN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "top_patterns",
      patterns: getTopPatterns(
        patternType as OperationalPattern["patternType"] | undefined,
        typeof limit === "number" ? Math.min(limit, 100) : 10
      ),
      summary: getPatternSummary(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'publish_signal', 'broadcast_signal', 'signals_by_type', 'signals_by_tag', 'synthesize', 'knowledge_by_topic', 'record_pattern', 'get_pattern', or 'top_patterns'.`,
    },
    { status: 400 }
  );
}
