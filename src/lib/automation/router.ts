// VeloCity Automation Engine — Handler Router

import type { AutomationEventType, AutomationPayload, AutomationQueueItem, HandlerResult } from "@/types/automation";
import { handleAliceIntake }      from "./handlers/alice-intake";
import { handleMaxDispatch }      from "./handlers/max-dispatch";
import { handleNovaWorkflow }     from "./handlers/nova-workflow";
import { handleQuinnQuote }       from "./handlers/quinn-quote";
import { handleFinnPayment }      from "./handlers/finn-payment";
import { handleRexCompletion }    from "./handlers/rex-completion";
import { handleIvyDispute }       from "./handlers/ivy-dispute";
import { handleLenaRetention }    from "./handlers/lena-retention";
import { handleTessTerritory }    from "./handlers/tess-territory";
import { handleSLACheck }         from "./handlers/sla-check";
import { handlePayoutRelease }    from "./handlers/payout-release";
import { handleProviderOffer }    from "./handlers/provider-offer";

export async function route(
  eventType: AutomationEventType,
  payload: AutomationPayload,
  queueItem: AutomationQueueItem
): Promise<HandlerResult> {
  switch (eventType) {
    // ── Customer Intake ──────────────────────────────────
    case "service_request_created":
      return handleAliceIntake(payload, queueItem);

    // ── Dispatch ─────────────────────────────────────────
    case "serviceability_passed":
      return handleMaxDispatch(payload, queueItem);

    // ── Provider Offer Notification ──────────────────────
    case "provider_offer_sent":
      return handleProviderOffer(payload, queueItem);

    // ── Job Accepted ─────────────────────────────────────
    case "job_accepted":
      return handleNovaWorkflow(payload, queueItem);

    // ── State Changes ─────────────────────────────────────
    case "job_state_changed":
      return handleNovaWorkflow(payload, queueItem);

    // ── Quote ─────────────────────────────────────────────
    case "quote_submitted":
      return handleQuinnQuote(payload, queueItem);

    // ── Payment ───────────────────────────────────────────
    case "quote_approved":
    case "payment_captured":
    case "payment_failed":
      return handleFinnPayment(payload, queueItem);

    // ── Completion ────────────────────────────────────────
    case "job_completed":
    case "customer_confirmed":
      return handleRexCompletion(payload, queueItem);

    // ── Dispute ───────────────────────────────────────────
    case "dispute_opened":
    case "dispute_resolved":
      return handleIvyDispute(payload, queueItem);

    // ── Payout ────────────────────────────────────────────
    case "payout_queued":
    case "payout_released":
    case "payout_failed":
      return handlePayoutRelease(payload, queueItem);

    // ── SLA Alerts ────────────────────────────────────────
    case "sla_warn":
    case "sla_breach":
    case "sla_escalate":
    case "no_provider_accepted":
    case "job_stuck":
    case "provider_late":
      return handleSLACheck(payload, queueItem);

    // ── Daily / Territory ─────────────────────────────────
    case "daily_territory_analysis":
      return handleTessTerritory(payload, queueItem);

    case "retention_campaign":
    case "provider_scoring":
      return handleLenaRetention(payload, queueItem);

    // ── Catch-all (agent_run, unknown) ────────────────────
    default:
      return { success: true, output: { skipped: true, event_type: eventType } };
  }
}
