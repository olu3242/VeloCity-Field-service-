// GET  /api/admin/pricing — pricing rules, modes, category base prices
// POST /api/admin/pricing — calculate | validate_quote | quote_intelligence
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  calculatePrice,
  validateQuote,
  getBasePrice,
  getPricingMode,
  CATEGORY_BASE_PRICE_CENTS,
  CATEGORY_PRICING_MODE,
  type PricingInput,
} from "@/lib/pricing";
import { generateQuoteIntelligence } from "@/lib/pricing/quoteIntelligence";

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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const category = url.searchParams.get("category");

  if (category) {
    return NextResponse.json({
      category,
      basePrice: getBasePrice(category as Parameters<typeof getBasePrice>[0]),
      pricingMode: getPricingMode(category as Parameters<typeof getPricingMode>[0], false),
    });
  }

  const categoryRules = Object.keys(CATEGORY_BASE_PRICE_CENTS).map((cat) => ({
    category: cat,
    basePriceCents: CATEGORY_BASE_PRICE_CENTS[cat as keyof typeof CATEGORY_BASE_PRICE_CENTS],
    pricingMode: CATEGORY_PRICING_MODE[cat as keyof typeof CATEGORY_PRICING_MODE],
  }));

  return NextResponse.json({
    categories: categoryRules,
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

  if (action === "calculate") {
    const { input } = body as Record<string, unknown>;
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "input object required" }, { status: 400 });
    }
    const pricingInput = input as PricingInput;
    if (typeof pricingInput.category !== "string" || typeof pricingInput.urgency !== "string") {
      return NextResponse.json({ error: "input.category and input.urgency required" }, { status: 400 });
    }
    const result = calculatePrice(pricingInput);
    return NextResponse.json({ action: "calculate", result, success: true });
  }

  if (action === "validate_quote") {
    const { submittedCents, input } = body as Record<string, unknown>;
    if (typeof submittedCents !== "number") {
      return NextResponse.json({ error: "submittedCents required" }, { status: 400 });
    }
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "input object required" }, { status: 400 });
    }
    const pricingInput = input as PricingInput;
    if (typeof pricingInput.category !== "string" || typeof pricingInput.urgency !== "string") {
      return NextResponse.json({ error: "input.category and input.urgency required" }, { status: 400 });
    }
    const engine = calculatePrice(pricingInput);
    const validation = validateQuote(submittedCents, engine);
    return NextResponse.json({ action: "validate_quote", engine, validation, success: true });
  }

  if (action === "quote_intelligence") {
    const { input } = body as Record<string, unknown>;
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "input object required" }, { status: 400 });
    }
    const pricingInput = input as PricingInput;
    if (typeof pricingInput.category !== "string" || typeof pricingInput.urgency !== "string") {
      return NextResponse.json({ error: "input.category and input.urgency required" }, { status: 400 });
    }
    const intelligence = generateQuoteIntelligence(pricingInput);
    return NextResponse.json({ action: "quote_intelligence", intelligence, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'calculate', 'validate_quote', or 'quote_intelligence'.` },
    { status: 400 }
  );
}
