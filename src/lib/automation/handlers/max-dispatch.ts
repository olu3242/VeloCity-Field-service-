// Handler: serviceability_passed → MAX ranks providers → sends offers

import { getAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runAgent";
import { max } from "@/lib/agents/max";
import { emitEvent } from "../emitEvent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  ServiceabilityPassedPayload,
} from "@/types/automation";

const OFFER_EXPIRY_MINUTES = 10;

export async function handleMaxDispatch(
  rawPayload: AutomationPayload,
  _item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as ServiceabilityPassedPayload;
  const { job_id, category, urgency, zip, city, state } = payload;

  if (!job_id) return { success: false, error: "Missing job_id" };

  const db = getAdminClient();

  // ── Fetch job ────────────────────────────────────────────
  const { data: job } = await db.from("jobs").select("*").eq("id", job_id).single();
  if (!job) return { success: false, error: "Job not found" };

  // ── Fetch eligible providers ─────────────────────────────
  const { data: providers } = await db
    .from("providers")
    .select("*")
    .eq("status", "approved")
    .eq("is_online", true)
    .contains("categories", [category]);

  if (!providers || providers.length === 0) {
    // No providers available — schedule retry and alert admin
    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "system_alert",
      title: "Finding Your Provider",
      body: "We're expanding our search to find the best provider for you. We'll notify you shortly.",
      channel: "in_app",
    });

    // Emit no_provider_accepted to trigger escalation
    await emitEvent(
      "no_provider_accepted",
      { job_id, attempt: 1, reason: "no_eligible_providers" },
      `no_provider:${job_id}:1`
    );

    return { success: true, output: { job_id, dispatched: false, reason: "no_eligible_providers" } };
  }

  // ── Commercial dispatch narrowing (Gold/Elite-only, SLA-aware) ────
  // No-op for non-commercial jobs — assessCommercialDispatchPriority
  // returns the full candidate pool unchanged when commercial_contract_id
  // is absent.
  const dispatchPriority = await max.assessCommercialDispatchPriority(
    job_id,
    providers.map((p) => p.id)
  );
  const eligibleProviders = dispatchPriority.isCommercial
    ? providers.filter((p) => dispatchPriority.eligibleProviderIds.includes(p.id))
    : providers;

  if (dispatchPriority.isCommercial && eligibleProviders.length === 0) {
    await db.from("notifications").insert({
      user_id: job.customer_id,
      type: "system_alert",
      title: "Finding Your Provider",
      body: "We're expanding our search to find the best provider for you. We'll notify you shortly.",
      channel: "in_app",
    });
    await emitEvent(
      "no_provider_accepted",
      { job_id, attempt: 1, reason: "no_eligible_commercial_providers" },
      `no_provider:${job_id}:1`
    );
    return { success: true, output: { job_id, dispatched: false, reason: "no_eligible_commercial_providers" } };
  }

  // ── Run MAX ──────────────────────────────────────────────
  const maxResult = await runAgent("MAX", {
    job: { id: job_id, category, urgency, city, state, zip, description: job.description },
    providers: eligibleProviders.slice(0, 20), // MAX sees top 20
    jobId: job_id,
  });

  const matchData = maxResult.data as {
    ranked_providers?: Array<{ provider_id: string; score: number; recommended: boolean }>;
    offer_expiry_minutes?: number;
    dispatch_strategy?: string;
  } | null;

  // Fallback ranking: online approved providers sorted by trust_score
  const rankedIds: string[] = matchData?.ranked_providers
    ? matchData.ranked_providers
        .filter((p) => p.recommended)
        .slice(0, 3)
        .map((p) => p.provider_id)
    : eligibleProviders
        .sort((a, b) => (b.trust_score ?? 0) - (a.trust_score ?? 0))
        .slice(0, 3)
        .map((p) => p.id);

  const expiresAt = new Date(
    Date.now() + (matchData?.offer_expiry_minutes ?? OFFER_EXPIRY_MINUTES) * 60_000
  ).toISOString();

  // ── Create offers ────────────────────────────────────────
  if (rankedIds.length > 0) {
    const offerInserts = rankedIds.map((providerId) => ({
      job_id,
      provider_id: providerId,
      status: "pending",
      expires_at: expiresAt,
    }));

    await db.from("provider_offers").insert(offerInserts);

    // Update job status
    await db.from("jobs").update({ status: "offer_sent" }).eq("id", job_id);

    // Notify providers
    for (const providerId of rankedIds) {
      const provider = providers.find((p) => p.id === providerId);
      if (provider) {
        await db.from("notifications").insert({
          user_id: provider.user_id,
          type: "new_job_offer",
          title: "New Job Available",
          body: `${urgency === "emergency" ? "🚨 EMERGENCY: " : ""}${category} job in ${city}, ${state}. Offer expires in ${OFFER_EXPIRY_MINUTES} min.`,
          channel: "in_app",
          metadata: { job_id, expires_at: expiresAt },
        });

        await emitEvent(
          "provider_offer_sent",
          { job_id, provider_id: providerId, expires_at: expiresAt },
          `offer:${job_id}:${providerId}`
        );
      }
    }
  }

  return {
    success: true,
    output: {
      job_id,
      dispatched: rankedIds.length > 0,
      provider_count: rankedIds.length,
      strategy: matchData?.dispatch_strategy ?? "immediate",
      expires_at: expiresAt,
      max_output: matchData,
    },
  };
}
