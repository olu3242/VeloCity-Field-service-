// VeloCity Automation Router
// Routes events to their canonical handler functions.
// Each handler owns its DB writes, notifications, event chaining, and agent calls.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { routeGrowthAutomationEvent } from "./growthEvents";
import type { AutomationEventType, AutomationRouteResult } from "./types";
import type { AutomationQueueItem, AutomationPayload } from "@/types/automation";

// ── Handler imports ────────────────────────────────────────────────────────
import { handleAliceIntake } from "./handlers/alice-intake";
import { handleMaxDispatch } from "./handlers/max-dispatch";
import { handleNovaWorkflow } from "./handlers/nova-workflow";
import { handleQuinnQuote } from "./handlers/quinn-quote";
import { handleFinnPayment } from "./handlers/finn-payment";
import { handleRexCompletion } from "./handlers/rex-completion";
import { handleIvyDispute } from "./handlers/ivy-dispute";
import { handleLenaRetention } from "./handlers/lena-retention";
import { handleTessTerritory } from "./handlers/tess-territory";
import { handlePayoutRelease } from "./handlers/payout-release";
import { handleProviderOffer } from "./handlers/provider-offer";
import { handleSLACheck } from "./handlers/sla-check";
import { handleTipSubmitted } from "./handlers/tip-submitted";

// ── Build a synthetic queue item for handlers that need one ──────────────
function syntheticQueueItem(eventType: AutomationEventType, payload: AutomationPayload): AutomationQueueItem {
  return {
    id: `synthetic-${Date.now()}`,
    event_id: null,
    event_type: eventType as AutomationQueueItem["event_type"],
    payload,
    status: "processing",
    retry_count: 0,
    max_retries: 3,
    next_retry_at: new Date().toISOString(),
    dedup_key: null,
    error_message: null,
    created_at: new Date().toISOString(),
    processed_at: null,
  };
}

// ── Main router ────────────────────────────────────────────────────────────
export async function routeAutomationEvent(
  eventType: AutomationEventType,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<AutomationRouteResult> {
  const tenantId = typeof payload.tenant_id === "string" ? payload.tenant_id : DEFAULT_TENANT_ID;
  const jobId = typeof payload.job_id === "string" ? payload.job_id : undefined;
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
    case "provider_penalty_applied":
    case "no_provider_accepted": {
      actions.push("MAX.dispatch_review");
      output.max = await runAgent(max, `Automation dispatch review: ${eventType}. Payload: ${JSON.stringify(payload)}`, { jobId, tenantId });
      break;
    }
    case "job_accepted":
    case "job_state_changed":
    case "job_started":
    case "provider_arrived":
    case "job_completed":
    case "customer_confirmed":
    case "sla_breach_detected":
    case "sla_warning":
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

      // ── MAX: Dispatch ───────────────────────────────────────────────────
      case "provider_offer_sent":
      case "provider_offer_expired":
      case "job_reassigned":
      case "no_provider_accepted": {
        // Provider offer flow first, then MAX dispatch
        actions.push("provider-offer", "max-dispatch");
        const offerResult = await handleProviderOffer(typedPayload, queueItem);
        output.offer = offerResult;
        const dispatchResult = await handleMaxDispatch(typedPayload, queueItem);
        output.max = dispatchResult;
        break;
      }

      // ── NOVA: Workflow ──────────────────────────────────────────────────
      case "job_accepted":
      case "job_state_changed":
      case "job_started": {
        actions.push("nova-workflow");
        const result = await handleNovaWorkflow(typedPayload, queueItem);
        output.nova = result;
        break;
      }

      // ── REX + LENA: Completion ──────────────────────────────────────────
      case "job_completed":
      case "customer_confirmed": {
        actions.push("rex-completion", "nova-workflow");
        const rexResult = await handleRexCompletion(typedPayload, queueItem);
        output.rex = rexResult;
        const novaResult = await handleNovaWorkflow(typedPayload, queueItem);
        output.nova = novaResult;
        break;
      }

      // ── QUINN: Quotes ───────────────────────────────────────────────────
      case "quote_submitted":
      case "quote_validated":
      case "quote_flagged":
      case "change_order_submitted":
      case "quote_approved":
      case "quote_rejected": {
        actions.push("quinn-quote");
        const result = await handleQuinnQuote(typedPayload, queueItem);
        output.quinn = result;
        if (eventType === "quote_approved") {
          actions.push("finn-payment");
          const finnResult = await handleFinnPayment(typedPayload, queueItem);
          output.finn = finnResult;
        }
        break;
      }

      // ── FINN: Finance & Payouts ─────────────────────────────────────────
      case "payment_authorized":
      case "payment_captured":
      case "payment_failed":
      case "failed_payment_retry":
      case "refund_requested":
      case "refund_issued":
      case "chargeback_opened": {
        actions.push("finn-payment");
        const result = await handleFinnPayment(typedPayload, queueItem);
        output.finn = result;
        break;
      }

      case "payout_queued":
      case "payout_hold":
      case "payout_released":
      case "payout_failed":
      case "payout_retry_scheduled": {
        actions.push("payout-release", "finn-payment");
        const payoutResult = await handlePayoutRelease(typedPayload, queueItem);
        output.payout = payoutResult;
        const finnResult = await handleFinnPayment(typedPayload, queueItem);
        output.finn = finnResult;
        break;
      }

      // ── IVY: Disputes ───────────────────────────────────────────────────
      case "dispute_opened":
      case "dispute_resolved": {
        actions.push("ivy-dispute");
        const result = await handleIvyDispute(typedPayload, queueItem);
        output.ivy = result;
        break;
      }

      // ── LENA: Retention ─────────────────────────────────────────────────
      case "review_requested":
      case "subscription_due":
      case "warranty_callback_due":
      case "retention_campaign":
      case "retention_campaign_due": {
        actions.push("lena-retention");
        const result = await handleLenaRetention(typedPayload, queueItem);
        output.lena = result;
        break;
      }

      // ── REX: Provider Scoring ───────────────────────────────────────────
      case "provider_scoring":
      case "provider_scoring_due": {
        actions.push("rex-completion");
        const result = await handleRexCompletion(typedPayload, queueItem);
        output.rex = result;
        break;
      }

      // ── SLA: Monitoring ─────────────────────────────────────────────────
      case "sla_breach_detected":
      case "stuck_job_detected":
      case "sla_warn":
      case "sla_breach":
      case "sla_escalate":
      case "job_stuck":
      case "provider_late": {
        actions.push("sla-check");
        const result = await handleSLACheck(typedPayload, queueItem);
        output.sla = result;
        break;
      }

      // ── TESS: Territory ─────────────────────────────────────────────────
      case "daily_territory_analysis":
      case "high_demand_area_detected":
      case "provider_shortage_detected":
      case "surge_pricing_recommended":
      case "recurring_service_opportunity_detected":
      case "provider_subscription_opportunity_detected":
      case "customer_churn_risk_detected":
      case "territory_ready_for_expansion":
      case "franchise_candidate_area_detected": {
        actions.push("tess-territory");
        if (eventType !== "daily_territory_analysis") {
          output.growth = routeGrowthAutomationEvent({
            type: eventType,
            tenantId: String(payload.tenant_id ?? "default"),
            entityId: typeof payload.entity_id === "string" ? payload.entity_id : undefined,
            severity: (payload.severity as "low" | "medium" | "high" | "critical") ?? "medium",
            payload,
            recommendations: Array.isArray(payload.recommendations)
              ? payload.recommendations.map(String)
              : ["Review growth signal."],
          });
        }
        const result = await handleTessTerritory(typedPayload, queueItem);
        output.tess = result;
        break;
      }

      // ── TIPS ─────────────────────────────────────────────────────────────
      case "tip_submitted": {
        actions.push("tip-submitted");
        const result = await handleTipSubmitted(typedPayload, queueItem);
        output.tip = result;
        break;
      }

      // ── Default: GABRIEL governance ──────────────────────────────────────
      default: {
        actions.push("gabriel-governance");
        // GABRIEL audit log for unhandled events
        await supabase.from("audit_logs").insert({
          action: `unhandled_event:${eventType}`,
          actor_id: typeof payload.actor_id === "string" ? payload.actor_id : null,
          entity_type: "automation_event",
          entity_id: typeof payload.job_id === "string" ? payload.job_id : null,
          metadata: { event_type: eventType, payload },
        }).then(() => null);
        output.gabriel = { handled: false, event_type: eventType, note: "No specific handler — GABRIEL audit logged" };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    output.error = msg;
    // Still log to audit even on handler error
    await supabase.from("audit_logs").insert({
      action: `handler_error:${eventType}`,
      actor_id: null,
      entity_type: "automation_event",
      entity_id: jobId ?? null,
      metadata: { event_type: eventType, error: msg },
    }).then(() => null);
  }

  // GABRIEL governance audit log for every processed event
  await supabase.from("agent_logs").insert({
    agent_name: "GABRIEL",
    tenant_id: tenantId,
    job_id: jobId ?? null,
    user_id: typeof payload.actor_id === "string" ? payload.actor_id : null,
    action: "Governance Audit",
    input: { event_type: eventType, payload },
    output: { actions, handled: true },
    error: null,
  }).then(() => null);

  return { handled: true, actions, output };
}

// ── Convenience wrapper (used by /api/automation/process) ─────────────────
export async function route(
  eventType: AutomationEventType,
  payload: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const result = await routeAutomationEvent(eventType, payload, getAdminClient());
  return { success: result.handled, output: result.output };
}
