// GET  /api/admin/velocity-os — kernel status, uptime, module registry, subsystem telemetry
// POST /api/admin/velocity-os — register_module | emit_telemetry | check_subsystem
// Admin-only; tenant-scoped. Top-level operating-system view across every platform subsystem.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getOSStatus,
  getUptimeSeconds,
  isSubsystemActive,
} from "@/lib/velocity-os/os-kernel";
import {
  emitOSTelemetry,
  getSubsystemTelemetry,
  getRecentTelemetry,
  getTelemetrySummary,
  type OSTelemetryRecord,
} from "@/lib/velocity-os/os-telemetry";
import {
  getModule,
  registerModule,
  getModulesByCategory,
  getActiveModules,
  getPlatformModuleReport,
  type PlatformModule,
} from "@/lib/velocity-os/platform-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: PlatformModule["category"][] = [
  "runtime", "orchestration", "intelligence", "governance", "financial", "federation",
];
const VALID_MODULE_STATUSES: PlatformModule["status"][] = [
  "active", "loading", "failed", "disabled",
];
const VALID_EVENT_TYPES: OSTelemetryRecord["eventType"][] = [
  "startup", "shutdown", "error", "warning", "metric", "audit",
];

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
  const url = new URL(request.url);
  const subsystem = url.searchParams.get("subsystem");
  const moduleId = url.searchParams.get("moduleId");
  const category = url.searchParams.get("category") as PlatformModule["category"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  return NextResponse.json({
    kernel: {
      status: getOSStatus(),
      uptimeSeconds: getUptimeSeconds(),
      ...(subsystem ? { subsystemActive: isSubsystemActive(subsystem) } : {}),
    },
    modules: {
      active: getActiveModules(),
      report: getPlatformModuleReport(),
      ...(moduleId ? { module: getModule(moduleId) ?? null } : {}),
      ...(category && VALID_CATEGORIES.includes(category)
        ? { byCategory: getModulesByCategory(category) }
        : {}),
    },
    telemetry: {
      recent: getRecentTelemetry(limit),
      summary: getTelemetrySummary(),
      ...(subsystem ? { bySubsystem: getSubsystemTelemetry(subsystem, limit) } : {}),
    },
    supportedCategories: VALID_CATEGORIES,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "register_module") {
    const { moduleId, name, version, category, status, dependencies } =
      body as Record<string, unknown>;
    if (typeof moduleId !== "string" || moduleId.trim() === "") {
      return NextResponse.json({ error: "moduleId required" }, { status: 400 });
    }
    if (typeof name !== "string" || typeof version !== "string") {
      return NextResponse.json({ error: "name and version required" }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category as PlatformModule["category"])) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_MODULE_STATUSES.includes(status as PlatformModule["status"])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_MODULE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const deps = Array.isArray(dependencies) ? (dependencies as string[]) : [];
    // Reject dangling dependencies so the module graph stays resolvable.
    const missing = deps.filter((d) => getModule(d) === undefined);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown dependencies: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const registered = registerModule({
      moduleId,
      name,
      version,
      category: category as PlatformModule["category"],
      status: status as PlatformModule["status"],
      dependencies: deps,
    });
    emitOSTelemetry("platform-registry", "startup", `Module registered: ${moduleId}`, {
      moduleId,
      version,
    });
    return NextResponse.json(
      { action: "register_module", module: registered, report: getPlatformModuleReport(), success: true },
      { status: 201 }
    );
  }

  if (action === "emit_telemetry") {
    const { subsystem, eventType, message, payload } = body as Record<string, unknown>;
    if (typeof subsystem !== "string" || subsystem.trim() === "") {
      return NextResponse.json({ error: "subsystem required" }, { status: 400 });
    }
    if (!VALID_EVENT_TYPES.includes(eventType as OSTelemetryRecord["eventType"])) {
      return NextResponse.json(
        { error: `eventType must be one of: ${VALID_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof message !== "string" || message.trim() === "") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const record = emitOSTelemetry(
      subsystem,
      eventType as OSTelemetryRecord["eventType"],
      message,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
    );
    return NextResponse.json({ action: "emit_telemetry", record, success: true }, { status: 201 });
  }

  if (action === "check_subsystem") {
    const { subsystem } = body as Record<string, unknown>;
    if (typeof subsystem !== "string" || subsystem.trim() === "") {
      return NextResponse.json({ error: "subsystem required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "check_subsystem",
      subsystem,
      active: isSubsystemActive(subsystem),
      telemetry: getSubsystemTelemetry(subsystem, 20),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_module', 'emit_telemetry', or 'check_subsystem'.`,
    },
    { status: 400 }
  );
}
