import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export interface CronAuthOptions {
  /**
   * Also accept the secret from a `?secret=` query parameter.
   *
   * Off by default and deliberately opt-in: secrets in URLs are recorded in
   * access logs, proxy logs and browser history in a way headers are not. This
   * exists only so routes whose deployed cron configuration still passes the
   * secret that way keep working. Once those schedules send an
   * `x-cron-secret` or `Authorization: Bearer` header instead, drop the flag —
   * it is not something new routes should adopt.
   */
  allowQueryParam?: boolean;
}

/**
 * Authorises a cron-triggered request.
 *
 * Fails closed: when CRON_SECRET is not configured the request is refused with
 * 503 rather than allowed through. The inline pattern this replaces —
 * `if (expected && secret !== expected) return 401` — silently permits every
 * unauthenticated request whenever the secret is unset, on routes that trigger
 * payouts, queue processing and SLA sweeps.
 *
 * Returns null when the caller is authorised, or the response to return when
 * it is not.
 */
export function authorizeCron(
  request: NextRequest,
  options: CronAuthOptions = {}
): NextResponse | null {
  const expected = getEnv("CRON_SECRET");
  if (!expected) {
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 503 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const explicit = request.headers.get("x-cron-secret");
  if (bearer === expected || explicit === expected) return null;

  if (options.allowQueryParam) {
    const fromQuery = request.nextUrl.searchParams.get("secret");
    if (fromQuery === expected) return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
