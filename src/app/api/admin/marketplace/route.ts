// GET  /api/admin/marketplace — AI capabilities, automation workflow templates, capability report
// POST /api/admin/marketplace — register_capability | record_usage | publish_template | search_templates
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  registerCapability, getCapability, findCapabilitiesForEvent,
  recordUsage, getCapabilityReport,
  type AICapability,
} from "@/lib/ai-marketplace/capability-registry";
import {
  publishTemplate, getAllPublished, searchTemplates, incrementUsage,
} from "@/lib/automation-marketplace/workflow-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CAPABILITY_STATUSES: AICapability["status"][] = ["available", "beta", "deprecated", "restricted"];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return { error: "Forbidden", status: 403 as const, profile: null };
  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType");
  const capabilityId = url.searchParams.get("capabilityId");
  const templateQuery = url.searchParams.get("templateQuery");

  return NextResponse.json({
    capabilities: {
      report: getCapabilityReport(),
      ...(eventType ? { forEvent: findCapabilitiesForEvent(eventType) } : {}),
      ...(capabilityId ? { detail: getCapability(capabilityId) ?? null } : {}),
    },
    templates: {
      published: getAllPublished(),
      ...(templateQuery ? { search: searchTemplates(templateQuery) } : {}),
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  getTenantId(auth.profile);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "register_capability") {
    const { capabilityId, name, agentName, description, supportedEventTypes, requiredConfidence, policyGated, version, status } = body as Record<string, unknown>;
    if (typeof capabilityId !== "string" || typeof name !== "string" || typeof agentName !== "string") {
      return NextResponse.json({ error: "capabilityId, name, and agentName required" }, { status: 400 });
    }
    if (status && !VALID_CAPABILITY_STATUSES.includes(status as AICapability["status"])) {
      return NextResponse.json({ error: `status must be one of: ${VALID_CAPABILITY_STATUSES.join(", ")}` }, { status: 400 });
    }
    const cap: AICapability = {
      capabilityId,
      name,
      agentName,
      description: typeof description === "string" ? description : "",
      supportedEventTypes: Array.isArray(supportedEventTypes) ? supportedEventTypes as string[] : [],
      requiredConfidence: typeof requiredConfidence === "number" ? requiredConfidence : 0.7,
      policyGated: policyGated === true,
      version: typeof version === "string" ? version : "1.0.0",
      status: (status as AICapability["status"]) ?? "available",
      usageCount: 0,
    };
    registerCapability(cap);
    return NextResponse.json({ action, cap, success: true }, { status: 201 });
  }

  if (action === "record_usage") {
    const { capabilityId } = body as Record<string, unknown>;
    if (typeof capabilityId !== "string") return NextResponse.json({ error: "capabilityId required" }, { status: 400 });
    recordUsage(capabilityId);
    return NextResponse.json({ action, capabilityId, success: true });
  }

  if (action === "publish_template") {
    const { id, name, description, eventTypes, steps, version, tags, authorTenantId } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return NextResponse.json({ error: "id and name required" }, { status: 400 });
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      return NextResponse.json({ error: "eventTypes array (non-empty) required" }, { status: 400 });
    }
    const template = publishTemplate({
      id,
      name,
      description: typeof description === "string" ? description : "",
      version: typeof version === "string" ? version : "1.0.0",
      eventTypes: eventTypes as string[],
      steps: Array.isArray(steps) ? steps as string[] : [],
      authorTenantId: typeof authorTenantId === "string" ? authorTenantId : undefined,
      published: true,
      publishedAt: new Date().toISOString(),
      tags: Array.isArray(tags) ? tags as string[] : [],
    });
    return NextResponse.json({ action, template, success: true }, { status: 201 });
  }

  if (action === "increment_template_usage") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    incrementUsage(id);
    return NextResponse.json({ action, id, success: true });
  }

  if (action === "search_templates") {
    const { query } = body as Record<string, unknown>;
    if (typeof query !== "string") return NextResponse.json({ error: "query required" }, { status: 400 });
    const results = searchTemplates(query);
    return NextResponse.json({ action, results, count: results.length, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'register_capability', 'record_usage', 'publish_template', 'increment_template_usage', or 'search_templates'.` }, { status: 400 });
}
