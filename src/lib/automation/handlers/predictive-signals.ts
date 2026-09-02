// Handler: customer_churn_risk_detected / membership_renewal_due / provider_at_risk_detected
// Predictive intelligence signals — fired by the daily /api/cron/predictive route.
// Reads retention/risk data from existing intelligence functions and emits
// audit log entries + notification records. No new scoring engines; all
// signals are derived from functions already certified in the platform.

import { getAdminClient } from "@/lib/supabase/admin";
import { createInAppNotification } from "@/lib/notifications/server";
import type { AutomationPayload, AutomationQueueItem, HandlerResult } from "@/types/automation";

export async function handlePredictiveSignals(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as Record<string, unknown>;
  const db = getAdminClient();

  const tenant_id = typeof payload.tenant_id === "string" ? payload.tenant_id : null;
  if (!tenant_id) return { success: true, output: { skipped: "no tenant_id" } };

  if (item.event_type === "customer_churn_risk_detected") {
    const customer_id = typeof payload.customer_id === "string" ? payload.customer_id : null;
    const churn_risk_score = typeof payload.churn_risk_score === "number" ? payload.churn_risk_score : null;
    const reason = typeof payload.reason === "string" ? payload.reason : "No recent activity";

    if (customer_id) {
      await db.from("audit_logs").insert({
        action: "customer_churn_risk_detected",
        actor_id: null,
        entity_type: "profile",
        entity_id: customer_id,
        metadata: { tenant_id, churn_risk_score, reason },
      });
    }

    return { success: true, output: { customer_id, churn_risk_score, event: "customer_churn_risk_detected" } };
  }

  if (item.event_type === "membership_renewal_due") {
    const subscription_id = typeof payload.subscription_id === "string" ? payload.subscription_id : null;
    const customer_id = typeof payload.customer_id === "string" ? payload.customer_id : null;
    const plan_name = typeof payload.plan_name === "string" ? payload.plan_name : "Membership";
    const days_until_renewal = typeof payload.days_until_renewal === "number" ? payload.days_until_renewal : null;

    if (customer_id) {
      await createInAppNotification(db as Parameters<typeof createInAppNotification>[0], {
        userId: customer_id,
        tenantId: tenant_id,
        title: `${plan_name} renews soon`,
        body: days_until_renewal !== null
          ? `Your ${plan_name} membership renews in ${days_until_renewal} day${days_until_renewal !== 1 ? "s" : ""}.`
          : `Your ${plan_name} membership is coming up for renewal.`,
        data: { subscription_id, plan_name, days_until_renewal },
      });

      await db.from("audit_logs").insert({
        action: "membership_renewal_notification_sent",
        actor_id: null,
        entity_type: "membership_subscription",
        entity_id: subscription_id ?? customer_id,
        metadata: { tenant_id, customer_id, plan_name, days_until_renewal },
      });
    }

    return { success: true, output: { subscription_id, customer_id, event: "membership_renewal_due" } };
  }

  if (item.event_type === "provider_at_risk_detected") {
    const provider_id = typeof payload.provider_id === "string" ? payload.provider_id : null;
    const risk_reason = typeof payload.risk_reason === "string" ? payload.risk_reason : "Performance below threshold";
    const trust_score = typeof payload.trust_score === "number" ? payload.trust_score : null;
    const cancellation_rate = typeof payload.cancellation_rate === "number" ? payload.cancellation_rate : null;

    if (provider_id) {
      await db.from("audit_logs").insert({
        action: "provider_at_risk_detected",
        actor_id: null,
        entity_type: "provider",
        entity_id: provider_id,
        metadata: { tenant_id, risk_reason, trust_score, cancellation_rate },
      });
    }

    return { success: true, output: { provider_id, risk_reason, event: "provider_at_risk_detected" } };
  }

  return { success: true, output: { skipped: `unhandled predictive event: ${item.event_type}` } };
}
