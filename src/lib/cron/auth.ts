import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export function authorizeCron(request: NextRequest): NextResponse | null {
  const expected = getEnv("CRON_SECRET");
  if (!expected) {
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 503 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const explicit = request.headers.get("x-cron-secret");
  if (bearer === expected || explicit === expected) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
