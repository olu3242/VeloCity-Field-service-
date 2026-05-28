import { getAdminClient } from "@/lib/supabase/admin";

export async function consumeApiRateLimit(input: {
  tenantId: string;
  apiKeyId: string;
  route: string;
  limit?: number;
}) {
  const db = getAdminClient();
  const limit = input.limit ?? 600;
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const windowIso = windowStart.toISOString();

  const { data: existing } = await db
    .from("api_rate_windows")
    .select("id, request_count, limit_count")
    .eq("api_key_id", input.apiKeyId)
    .eq("route", input.route)
    .eq("window_start", windowIso)
    .maybeSingle();

  if (existing) {
    const nextCount = Number(existing.request_count ?? 0) + 1;
    if (nextCount > Number(existing.limit_count ?? limit)) {
      return { allowed: false, remaining: 0, resetAt: new Date(windowStart.getTime() + 60_000).toISOString() };
    }

    await db.from("api_rate_windows").update({
      request_count: nextCount,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);

    return {
      allowed: true,
      remaining: Math.max(0, Number(existing.limit_count ?? limit) - nextCount),
      resetAt: new Date(windowStart.getTime() + 60_000).toISOString(),
    };
  }

  await db.from("api_rate_windows").insert({
    tenant_id: input.tenantId,
    api_key_id: input.apiKeyId,
    route: input.route,
    window_start: windowIso,
    request_count: 1,
    limit_count: limit,
  });

  return { allowed: true, remaining: limit - 1, resetAt: new Date(windowStart.getTime() + 60_000).toISOString() };
}
