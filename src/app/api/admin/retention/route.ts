// GET  /api/admin/retention — rebooking windows for every service category
// POST /api/admin/retention — churn_risk | loyalty_offer | maintenance_reminder
//                             | membership_recommendation | rebooking_window | lifecycle_plan
// Admin-only; tenant-scoped. Customer lifecycle intelligence — churn, save offers, and rebooking cadence.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import type { ServiceCategory } from "@/types";
import { calculateChurnRisk } from "@/lib/retention/churnRisk";
import { recommendLoyaltyOffer } from "@/lib/retention/loyaltyOfferEngine";
import { buildMaintenanceReminder } from "@/lib/retention/maintenanceReminderEngine";
import { recommendMembership } from "@/lib/retention/membershipRecommendation";
import { recommendRebookingWindow } from "@/lib/retention/rebookingRules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVICE_CATEGORIES: ServiceCategory[] = [
  "plumbing", "electrical", "hvac", "cleaning", "landscaping", "pest_control",
  "appliance_repair", "locksmith", "handyman", "painting", "roofing", "flooring",
  "carpentry", "moving", "pool_service", "garage_door", "windows", "other",
];

function isServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === "string" && SERVICE_CATEGORIES.includes(value as ServiceCategory);
}

function categoryError() {
  return NextResponse.json(
    { error: `category must be one of: ${SERVICE_CATEGORIES.join(", ")}` },
    { status: 400 }
  );
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
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");

  return NextResponse.json({
    rebookingWindows: SERVICE_CATEGORIES.map((category) => ({
      category,
      ...recommendRebookingWindow(category),
    })),
    ...(isServiceCategory(categoryParam)
      ? {
          category: {
            name: categoryParam,
            rebooking: recommendRebookingWindow(categoryParam),
            reminder: buildMaintenanceReminder(categoryParam),
          },
        }
      : {}),
    supportedCategories: SERVICE_CATEGORIES,
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

  if (action === "churn_risk") {
    const { daysSinceLastJob, completedJobs, lastRating, openDisputes } =
      body as Record<string, unknown>;
    if (typeof daysSinceLastJob !== "number" || typeof completedJobs !== "number") {
      return NextResponse.json(
        { error: "daysSinceLastJob and completedJobs must be numbers" },
        { status: 400 }
      );
    }
    const risk = calculateChurnRisk({
      daysSinceLastJob,
      completedJobs,
      ...(typeof lastRating === "number" || lastRating === null ? { lastRating } : {}),
      ...(typeof openDisputes === "number" ? { openDisputes } : {}),
    });
    return NextResponse.json({ action: "churn_risk", risk, success: true });
  }

  if (action === "loyalty_offer") {
    const { completedJobs, churnRiskScore } = body as Record<string, unknown>;
    if (typeof completedJobs !== "number" || typeof churnRiskScore !== "number") {
      return NextResponse.json(
        { error: "completedJobs and churnRiskScore must be numbers" },
        { status: 400 }
      );
    }
    const offer = recommendLoyaltyOffer({ completedJobs, churnRiskScore });
    return NextResponse.json({ action: "loyalty_offer", offer, success: true });
  }

  if (action === "maintenance_reminder") {
    const { category, customerName } = body as Record<string, unknown>;
    if (!isServiceCategory(category)) return categoryError();
    const reminder = buildMaintenanceReminder(
      category,
      typeof customerName === "string" && customerName.trim() !== "" ? customerName : undefined
    );
    return NextResponse.json({ action: "maintenance_reminder", reminder, success: true });
  }

  if (action === "membership_recommendation") {
    const { category, completedJobs } = body as Record<string, unknown>;
    if (!isServiceCategory(category)) return categoryError();
    if (typeof completedJobs !== "number") {
      return NextResponse.json({ error: "completedJobs must be a number" }, { status: 400 });
    }
    const recommendation = recommendMembership(category, completedJobs);
    return NextResponse.json({ action: "membership_recommendation", recommendation, success: true });
  }

  if (action === "rebooking_window") {
    const { category } = body as Record<string, unknown>;
    if (!isServiceCategory(category)) return categoryError();
    const window = recommendRebookingWindow(category);
    return NextResponse.json({ action: "rebooking_window", window, success: true });
  }

  if (action === "lifecycle_plan") {
    // Composite view — the full retention picture for one customer in a single call.
    const { category, daysSinceLastJob, completedJobs, lastRating, openDisputes, customerName } =
      body as Record<string, unknown>;
    if (!isServiceCategory(category)) return categoryError();
    if (typeof daysSinceLastJob !== "number" || typeof completedJobs !== "number") {
      return NextResponse.json(
        { error: "daysSinceLastJob and completedJobs must be numbers" },
        { status: 400 }
      );
    }

    const risk = calculateChurnRisk({
      daysSinceLastJob,
      completedJobs,
      ...(typeof lastRating === "number" || lastRating === null ? { lastRating } : {}),
      ...(typeof openDisputes === "number" ? { openDisputes } : {}),
    });

    return NextResponse.json({
      action: "lifecycle_plan",
      plan: {
        churnRisk: risk,
        loyaltyOffer: recommendLoyaltyOffer({ completedJobs, churnRiskScore: risk.score }),
        membership: recommendMembership(category, completedJobs),
        rebooking: recommendRebookingWindow(category),
        reminder: buildMaintenanceReminder(
          category,
          typeof customerName === "string" && customerName.trim() !== "" ? customerName : undefined
        ),
      },
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'churn_risk', 'loyalty_offer', 'maintenance_reminder', 'membership_recommendation', 'rebooking_window', or 'lifecycle_plan'.`,
    },
    { status: 400 }
  );
}
