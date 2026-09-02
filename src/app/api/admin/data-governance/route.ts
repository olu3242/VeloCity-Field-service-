// GET    /api/admin/data-governance — retention policies, expired records, PII inventory, tenant boundaries
// POST   /api/admin/data-governance — register_boundary | tag_data
// DELETE /api/admin/data-governance?id=... — mark a retention record as purged
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getAllPolicies,
  getPoliciesByTag,
  getEncryptedCategories,
} from "@/lib/data-governance/retention-policy";
import {
  getExpiredRecords,
  getPurgeDueRecords,
  markPurged,
  markArchived,
} from "@/lib/data-governance/audit-retention";
import {
  getBoundary,
  registerBoundary,
  getStrictComplianceTenants,
  type TenantDataBoundary,
} from "@/lib/data-governance/tenant-boundaries";
import {
  getPIIData,
  getTagsByFramework,
  getTagsByLevel,
  tagData,
  type ComplianceFramework,
} from "@/lib/data-governance/compliance-tagger";

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
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const framework = url.searchParams.get("framework") as ComplianceFramework | null;
  const sensitivityLevel = url.searchParams.get("level") as
    | "public" | "internal" | "confidential" | "restricted"
    | null;

  const policies = getAllPolicies();
  const encryptedCategories = getEncryptedCategories();
  const tenantBoundary = getBoundary(tenantId);
  const expiredRecords = getExpiredRecords(tenantId);
  const purgeDueRecords = getPurgeDueRecords().filter((r) => r.tenantId === tenantId);
  const piiItems = getPIIData();

  const tagsByFramework = framework ? getTagsByFramework(framework) : [];
  const tagsByLevel = sensitivityLevel ? getTagsByLevel(sensitivityLevel) : [];

  const strictTenants =
    auth.profile.role === "super_admin" ? getStrictComplianceTenants() : [];

  return NextResponse.json({
    tenantId,
    policies,
    encryptedCategories,
    tenantBoundary,
    retention: {
      expired: expiredRecords,
      purgeDue: purgeDueRecords,
      expiredCount: expiredRecords.length,
      purgeDueCount: purgeDueRecords.length,
    },
    pii: {
      items: piiItems,
      total: piiItems.length,
    },
    ...(framework && { tagsByFramework }),
    ...(sensitivityLevel && { tagsByLevel }),
    ...(strictTenants.length > 0 && { strictTenants }),
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

  const { action } = body as Record<string, unknown>;

  if (action === "register_boundary") {
    const {
      allowedDataCategories,
      restrictedOperations,
      dataResidencyRegion,
      encryptionRequired,
      customRetentionDays,
      complianceLevel,
    } = body as Record<string, unknown>;

    const boundary: TenantDataBoundary = {
      tenantId,
      allowedDataCategories: Array.isArray(allowedDataCategories)
        ? (allowedDataCategories as string[]).filter(Boolean) as TenantDataBoundary["allowedDataCategories"]
        : ["audit_logs", "automation_events", "agent_traces", "telemetry_snapshots", "webhook_payloads", "operational_memory", "user_pii"],
      restrictedOperations: Array.isArray(restrictedOperations)
        ? (restrictedOperations as string[])
        : [],
      dataResidencyRegion: typeof dataResidencyRegion === "string" ? dataResidencyRegion : undefined,
      encryptionRequired: encryptionRequired === true,
      customRetentionDays: typeof customRetentionDays === "number" ? customRetentionDays : undefined,
      complianceLevel:
        complianceLevel === "standard" || complianceLevel === "enhanced" || complianceLevel === "strict"
          ? complianceLevel
          : "standard",
    };

    registerBoundary(boundary);
    return NextResponse.json({ action: "register_boundary", tenantId, boundary, success: true });
  }

  if (action === "tag_data") {
    const { dataId, dataType, frameworks, containsPII, sensitivityLevel } =
      body as Record<string, unknown>;

    if (typeof dataId !== "string" || typeof dataType !== "string") {
      return NextResponse.json(
        { error: "dataId and dataType required" },
        { status: 400 }
      );
    }

    const tag = tagData(
      dataId,
      dataType,
      Array.isArray(frameworks) ? (frameworks as ComplianceFramework[]) : [],
      containsPII === true,
      (sensitivityLevel as "public" | "internal" | "confidential" | "restricted") ?? "internal",
      auth.profile.role ?? "admin"
    );

    return NextResponse.json({ action: "tag_data", tag, success: true });
  }

  if (action === "mark_archived") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    markArchived(id);
    return NextResponse.json({ action: "mark_archived", id, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'register_boundary', 'tag_data', or 'mark_archived'.` },
    { status: 400 }
  );
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  markPurged(id);
  return NextResponse.json({ purged: id, success: true });
}
