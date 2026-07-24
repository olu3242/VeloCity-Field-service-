// GET  /api/admin/scale — autoscale history and active scaling operations
// POST /api/admin/scale — initiate a scaling operation
// Admin-only.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  initiateScale,
  completeScale,
  getActiveScalingOps,
  getScaleHistory,
  getScalingSummary,
} from "@/lib/elastic-scale/autoscale-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const resourceType = url.searchParams.get("resourceType") ?? undefined;

  return NextResponse.json({
    activeOps: getActiveScalingOps(),
    history: getScaleHistory(resourceType),
    summary: getScalingSummary(),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { resourceType, fromLevel, toLevel, trigger, complete, status } =
    body as Record<string, unknown>;

  // Complete an in-flight scale operation
  if (typeof complete === "string") {
    const finalStatus = status === "failed" ? "failed" : "complete";
    completeScale(complete, finalStatus);
    return NextResponse.json({ completed: complete, status: finalStatus });
  }

  // Initiate a new scale operation
  if (
    typeof resourceType !== "string" ||
    typeof fromLevel !== "number" ||
    typeof toLevel !== "number" ||
    typeof trigger !== "string"
  ) {
    return NextResponse.json(
      { error: "resourceType, fromLevel, toLevel, trigger required" },
      { status: 400 }
    );
  }

  try {
    const event = initiateScale(resourceType, fromLevel, toLevel, trigger);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scale initiation failed" },
      { status: 409 }
    );
  }
}
