import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { dispatchWebhookDeliveries } from "@/runtime/webhooks/delivery";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 25);
  try {
    const data = await dispatchWebhookDeliveries(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Webhook dispatch failed" },
      { status: 500 }
    );
  }
}
