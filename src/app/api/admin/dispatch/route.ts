import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { max } from "@/lib/agents/max";
import { dispatchSchema, validationError } from "@/lib/validation";
import { createInAppNotification } from "@/lib/notifications/server";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import type { Provider, Job } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = dispatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const { job_id, provider_id } = parsed.data;
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "jobs", action: "assign_provider", route: "/api/admin/dispatch" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = await createAdminClient();

  const { data: job } = await adminClient
    .from("jobs")
    .select("*")
    .eq("id", job_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Get eligible providers
  const { data: providers } = await adminClient
    .from("providers")
    .select("*, profiles!providers_user_id_fkey(full_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .eq("is_online", true)
    .contains("categories", [job.category]);

  const eligibleProviders = provider_id
    ? providers?.filter((provider) => provider.id === provider_id)
    : providers;

  if (!eligibleProviders?.length) {
    return NextResponse.json({ error: "No available providers" }, { status: 422 });
  }

  // MAX ranks providers
  const maxOutput = await max.match(
    job as Partial<Job>,
    eligibleProviders as Partial<Provider>[],
    { jobId: job_id }
  );

  if (!maxOutput?.ranked_providers.length) {
    return NextResponse.json({ error: "No suitable providers found" }, { status: 422 });
  }

  // Send offers to top providers
  const topProviders = maxOutput.ranked_providers
    .filter((p) => p.recommended)
    .slice(0, 3);

  const expiresAt = new Date(
    Date.now() + maxOutput.offer_expiry_minutes * 60 * 1000
  ).toISOString();

  const offers = await Promise.all(
    topProviders.map((p) =>
      adminClient.from("provider_offers").upsert({
        job_id,
        tenant_id: tenantId,
        provider_id: p.provider_id,
        match_score: p.score,
        ai_reasoning: p.reasoning,
        offered_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
    )
  );

  // Update job status to offer_sent
  await adminClient.from("jobs").update({ status: "offer_sent" }).eq("id", job_id).eq("tenant_id", tenantId);

  await emitEvent(adminClient, {
    type: "job_state_changed",
    source: "api.admin.dispatch",
    entityType: "job",
    entityId: job_id,
    actorId: user.id,
    tenantId,
    dedupKey: `job_state_changed:${job_id}:offer_sent`,
    payload: {
      job_id,
      tenant_id: tenantId,
      from_status: job.status,
      to_status: "offer_sent",
      actor_role: "admin",
      category: job.category,
      title: job.title,
    },
  });

  await Promise.all(
    topProviders.map(async (p) => {
      const provider = eligibleProviders.find((item) => item.id === p.provider_id);
      if (provider?.user_id) {
        await createInAppNotification(adminClient, {
          userId: provider.user_id,
          tenantId,
          title: "New job offer",
          body: `A ${job.category} job is available in ${job.city ?? "your area"}.`,
          data: { job_id, provider_id: p.provider_id },
        });
      }
      await emitEvent(adminClient, {
        type: "provider_offer_sent",
        source: "api.admin.dispatch",
        entityType: "job",
        entityId: job_id,
        actorId: user.id,
        tenantId,
        dedupKey: `provider_offer_sent:${job_id}:${p.provider_id}`,
        payload: {
          job_id,
          tenant_id: tenantId,
          provider_id: p.provider_id,
          match_score: p.score,
          expires_at: expiresAt,
          category: job.category,
          city: job.city,
          state: job.state,
        },
      });
    })
  );

  return NextResponse.json({
    data: { offers_sent: topProviders.length, max_output: maxOutput },
  });
}
