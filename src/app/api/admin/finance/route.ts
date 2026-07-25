// GET  /api/admin/finance — recent receipts, receipt by job
// POST /api/admin/finance — generate_invoice | generate_receipt
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { generateInvoice } from "@/lib/finance/generateInvoice";
import { generateReceipt } from "@/lib/finance/generateReceipt";

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
  const jobId = url.searchParams.get("jobId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const db = getAdminClient();

  if (jobId) {
    const { data: receipts } = await db
      .from("receipts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ tenantId, jobId, receipts: receipts ?? [], generatedAt: new Date().toISOString() });
  }

  const { data: receipts } = await db
    .from("receipts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({
    tenantId,
    receipts: receipts ?? [],
    count: (receipts ?? []).length,
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

  if (action === "generate_invoice") {
    const { jobId, amount, lineItems } = body as Record<string, unknown>;
    if (typeof jobId !== "string" || typeof amount !== "number") {
      return NextResponse.json({ error: "jobId and amount required" }, { status: 400 });
    }
    const invoice = generateInvoice({
      jobId,
      amount,
      lineItems: Array.isArray(lineItems) ? lineItems : [],
    });
    return NextResponse.json({ action: "generate_invoice", invoice, success: true });
  }

  if (action === "generate_receipt") {
    const { jobId, customerId, providerId, amount, breakdown } = body as Record<string, unknown>;
    if (typeof jobId !== "string" || typeof customerId !== "string" || typeof amount !== "number") {
      return NextResponse.json({ error: "jobId, customerId, and amount required" }, { status: 400 });
    }

    const db = getAdminClient();
    const { data: receipt, error } = await generateReceipt({
      supabase: db,
      tenantId,
      jobId,
      customerId,
      providerId: typeof providerId === "string" ? providerId : null,
      amount,
      breakdown: (breakdown && typeof breakdown === "object") ? (breakdown as Record<string, unknown>) : {},
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ action: "generate_receipt", receipt, success: true }, { status: 201 });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'generate_invoice' or 'generate_receipt'.` },
    { status: 400 }
  );
}
