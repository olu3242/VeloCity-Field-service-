import type { SupabaseClient } from "@supabase/supabase-js";
import { alice } from "@/lib/agents/alice";
import { finn } from "@/lib/agents/finn";
import { ivy } from "@/lib/agents/ivy";
import { lena } from "@/lib/agents/lena";
import { max } from "@/lib/agents/max";
import { nova } from "@/lib/agents/nova";
import { quinn } from "@/lib/agents/quinn";
import { rex } from "@/lib/agents/rex";
import { tess } from "@/lib/agents/tess";
import { gabriel } from "@/lib/agents/gabriel";
import { runAgent } from "@/lib/agents/runAgent";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { routeGrowthAutomationEvent } from "./growthEvents";
import type { AutomationEventType, AutomationRouteResult } from "./types";

export async function routeAutomationEvent(
  eventType: AutomationEventType,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<AutomationRouteResult> {
  const jobId = typeof payload.job_id === "string" ? payload.job_id : undefined;
  const tenantId = typeof payload.tenant_id === "string" ? payload.tenant_id : DEFAULT_TENANT_ID;
  const actions: string[] = [];
  const output: Record<string, unknown> = {};

  switch (eventType) {
    case "service_request_created":
    case "serviceability_passed":
    case "serviceability_failed": {
      actions.push("ALICE.intake_review");
      const description = String(payload.description ?? payload.title ?? "Service request");
      output.alice = await runAgent(alice, `Automation intake review for ZIP ${String(payload.zip ?? "")}: ${description}`, { jobId, userId: payload.customer_id as string | undefined, tenantId });
      break;
    }
    case "provider_offer_sent":
    case "provider_offer_expired":
    case "job_reassigned":
    case "no_provider_accepted": {
      actions.push("MAX.dispatch_review");
      output.max = await runAgent(max, `Automation dispatch review: ${eventType}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "job_accepted":
    case "job_state_changed":
    case "job_started":
    case "job_completed":
    case "customer_confirmed":
    case "sla_breach_detected":
    case "stuck_job_detected":
    case "sla_warn":
    case "sla_breach":
    case "sla_escalate":
    case "job_stuck":
    case "provider_late": {
      actions.push("NOVA.workflow_monitor");
      output.nova = await runAgent(nova, `Automation workflow review: from ${String(payload.from_status ?? "unknown")} to ${String(payload.to_status ?? eventType)} by ${String(payload.actor_role ?? "admin")}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      if (eventType === "job_completed" || eventType === "customer_confirmed") {
        actions.push("REX.quality_review", "LENA.retention_review");
        output.rex = await runAgent(rex, `Automation quality review for completed job. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
        output.lena = await runAgent(lena, `Automation retention review after completion. Payload: ${JSON.stringify(payload)}`, { jobId, userId: payload.customer_id as string | undefined, tenantId });
      }
      break;
    }
    case "quote_submitted":
    case "quote_validated":
    case "quote_flagged":
    case "change_order_submitted":
    case "quote_approved":
    case "quote_rejected": {
      actions.push("QUINN.quote_review");
      output.quinn = await runAgent(quinn, `Automation quote review: ${eventType}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "payment_authorized":
    case "payment_captured":
    case "payment_failed":
    case "failed_payment_retry":
    case "payout_queued":
    case "payout_hold":
    case "payout_released":
    case "payout_failed":
    case "payout_retry_scheduled":
    case "refund_requested":
    case "refund_issued":
    case "chargeback_opened": {
      actions.push("FINN.finance_review");
      output.finn = await runAgent(finn, `Automation finance review: ${eventType}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "dispute_opened":
    case "dispute_resolved": {
      actions.push("IVY.dispute_review");
      output.ivy = await runAgent(ivy, `Automation dispute review. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "review_requested": {
      actions.push("REX.review_prompt");
      output.rex = await runAgent(rex, `Automation review request check. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "subscription_due":
    case "warranty_callback_due":
    case "retention_campaign":
    case "retention_campaign_due": {
      actions.push("LENA.retention_campaign");
      output.lena = await runAgent(lena, `Automation retention campaign review: ${eventType}. Payload: ${JSON.stringify(payload)}`, { userId: payload.customer_id as string | undefined, tenantId });
      break;
    }
    case "provider_scoring":
    case "provider_scoring_due": {
      actions.push("REX.provider_scoring");
      output.rex = await runAgent(rex, `Automation provider scoring review. Payload: ${JSON.stringify(payload)}`, { userId: payload.provider_user_id as string | undefined, tenantId });
      break;
    }
    case "daily_territory_analysis":
    case "high_demand_area_detected":
    case "provider_shortage_detected":
    case "surge_pricing_recommended":
    case "recurring_service_opportunity_detected":
    case "provider_subscription_opportunity_detected":
    case "customer_churn_risk_detected":
    case "territory_ready_for_expansion":
    case "franchise_candidate_area_detected": {
      actions.push("TESS.territory_review");
      if (eventType !== "daily_territory_analysis") {
        output.growth = routeGrowthAutomationEvent({
          type: eventType,
          tenantId: String(payload.tenant_id ?? "default"),
          entityId: typeof payload.entity_id === "string" ? payload.entity_id : undefined,
          severity: (payload.severity as "low" | "medium" | "high" | "critical") ?? "medium",
          payload,
          recommendations: Array.isArray(payload.recommendations) ? payload.recommendations.map(String) : ["Review growth signal."],
        });
      }
      output.tess = await runAgent(tess, `Automation territory intelligence: ${eventType}. Payload: ${JSON.stringify(payload)}`, { userId: payload.actor_id as string | undefined, tenantId });
      break;
    }
    default: {
      actions.push("GABRIEL.governance_audit");
      output.gabriel = await runAgent(gabriel, `Automation governance audit: ${eventType}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
    }
  }

  await supabase.from("agent_logs").insert({
    agent_name: "GABRIEL",
    tenant_id: tenantId,
    job_id: jobId ?? null,
    user_id: typeof payload.actor_id === "string" ? payload.actor_id : null,
    action: "Automation Governance Audit",
    input: { event_type: eventType, payload },
    output: { actions, handled: true },
    error: null,
  });

  return { handled: true, actions, output };
}

export async function route(
  eventType: AutomationEventType,
  payload: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const result = await routeAutomationEvent(eventType, payload, getAdminClient());
  return { success: result.handled, output: result.output };
}
